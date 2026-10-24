#!/usr/bin/env python3
"""Grader for the head-to-head runs (docs/HEAD-TO-HEAD.md, "How a run is graded").

Usage:
  python3 -I grade.py <out-dir> [--runs N]
  python3 -I grade.py --self-test

For each task and run number whose arms all have final.txt, a criterion with a
script check in tasks.json is decided by the script on the arm's final answer,
with no model call. Every other criterion is marked pass or fail by a model for
the answers, labelled A to D in a shuffled order. A model-judged cell is graded by
three independent calls, and each criterion keeps the majority of the votes. The
label map is written to grade/labels.json. A reply already on disk
(grade/<task>-<n>.call<i>.out) is not asked again; delete grade/ to regrade.
Writes grade/scores.json and grade/RESULTS.md.

The arms are ours, pp (project-pilot), ppi (project-pilot with its command
invoked, for tasks that have a ppInvokedPrompt) and base. The win rule uses
outcome criteria only. Project-pilot is represented on each task by the
higher of its pp and ppi means. An arm whose plugin never loaded in any run
is reported as not run and is not an opponent.
"""
import datetime
import hashlib
import json
import os
import random
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ARMS = ["ours", "pp", "ppi", "base"]
LABELS = ["A", "B", "C", "D"]
KINDS = ("outcome", "process")
# Set by --arms: grade only these arms' cells (a reused-rivals round); empty means every arm.
ONLY_ARMS = []
RUN_DIR = re.compile(r"^(.+)-(ours|pp|ppi|base)-(\d+)$")
META = re.compile(r"^META cost=(\S+) ms=(\S+) turns=(\S+)$", re.M)
# Header lines written by summarize.py. They name the arm or reveal the plugin, so the grader never sees them.
STRIP = re.compile(r"^(PLUGIN_NAME: .*|PLUGIN_LOADED: .*|PLUGIN_SKILLS: .*|SKILLS: .*|SLASH: .*|META cost=.*)\n?", re.M)
HEADER = re.compile(r"^(PLUGIN_NAME|PLUGIN_LOADED|PLUGIN_SKILLS|SKILLS|SLASH): ?(.*)$", re.M)
WIN_MARGIN = 1.2
# Float tolerance for the 1.2x comparison: a total exactly at the boundary passes.
EPSILON = 1e-9
NOT_LOADED = "not run: plugin did not load"
VOTES = 3


def load_tasks():
    with open(os.path.join(HERE, "tasks.json"), encoding="utf-8") as fh:
        return json.load(fh)["tasks"]


def arms_for_task(task):
    """The arms that run on a task. ppi exists only where the task has an invoked prompt."""
    arms = ["ours", "pp"]
    if isinstance(task.get("ppInvokedPrompt"), str):
        arms.append("ppi")
    arms = arms + ["base"]
    return [a for a in arms if a in ONLY_ARMS] if ONLY_ARMS else arms


def kinds_for(task):
    """The outcome or process kind of each criterion, in criterion order."""
    kinds = task.get("criteriaKinds")
    if not isinstance(kinds, list) or len(kinds) != len(task["criteria"]) or any(k not in KINDS for k in kinds):
        raise ValueError("%s: criteriaKinds must name outcome or process for every criterion" % task["id"])
    return kinds


def label_map(task_id, run, arms=None):
    """Shuffled label to arm map for one cell, reproducible from the task, the run number and the arms."""
    shuffled = list(ARMS if arms is None else arms)
    random.Random(f"{task_id}-{run}-h2h-round").shuffle(shuffled)
    return dict(zip(LABELS, shuffled))


def strip_arm_markers(text):
    """Removes the header lines and META, which would reveal the arm."""
    return STRIP.sub("", text)


# Names that identify an arm even when a run's header does not give them.
KNOWN_PLUGIN_NAMES = ("surviving-lines", "project-pilot")
TOOL_BINARY = "surviving-lines"


def load_plugin_dirs(out):
    """The plugin directories recorded in <out>/PLUGIN_DIRS (JSON: arm to {dir, commit, version}), plus their real paths."""
    path = os.path.join(out, "PLUGIN_DIRS")
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return []
    dirs = []
    for entry in data.values() if isinstance(data, dict) else []:
        values = [entry.get("dir"), entry.get("realDir")] if isinstance(entry, dict) else [entry]
        for value in values:
            if isinstance(value, str) and value:
                for candidate in (value, os.path.realpath(value)):
                    candidate = candidate.rstrip("/")
                    if candidate and candidate not in dirs:
                        dirs.append(candidate)
    return dirs


def neutralise_commands(text, plugin_names=(), plugin_dirs=()):
    """Removes arm-revealing names, ids and paths from the COMMANDS RUN part of a final.txt.

    Plugin directories and ${CLAUDE_PLUGIN_ROOT} become <plugin>, plugin:skill ids become tool:skill,
    the tool binary becomes <tool> and a remaining plugin name becomes <plugin>. The answer text after
    FINAL ANSWER: is not touched. This covers names, ids and paths only: the numbers and wording a tool
    prints in a command's output can still reveal which arm ran.
    """
    head, sep, rest = text.partition("COMMANDS RUN:")
    if not sep:
        return text
    commands, sep2, answer = rest.partition("\nFINAL ANSWER:")
    names = sorted({n for n in list(KNOWN_PLUGIN_NAMES) + list(plugin_names) if n}, key=len, reverse=True)
    for directory in sorted(set(plugin_dirs), key=len, reverse=True):
        commands = commands.replace(directory, "<plugin>")
    commands = commands.replace("${CLAUDE_PLUGIN_ROOT}", "<plugin>").replace("$CLAUDE_PLUGIN_ROOT", "<plugin>")
    alternation = "|".join(re.escape(n) for n in names)
    commands = re.sub(r"(?<![\w-])(?:%s):[\w.-]+" % alternation, "tool:skill", commands)
    commands = re.sub(r"(?<![\w-])%s(?:\.js)?(?![\w-])" % re.escape(TOOL_BINARY), "<tool>", commands)
    commands = re.sub(r"(?<![\w-])(?:%s)(?![\w-])" % alternation, "<plugin>", commands)
    return head + sep + commands + sep2 + answer


def blind_text(text, plugin_dirs=()):
    """What the grader may read of one final.txt: header lines out, command lines neutralised."""
    head = parse_header(text)
    names = [head["plugin"]] if head["plugin"] else []
    return neutralise_commands(strip_arm_markers(text), names, plugin_dirs)


def read_meta(text):
    """(cost, duration_ms, turns) from the META line, each None when unknown."""
    match = None
    for match in META.finditer(text):
        pass
    if match is None:
        return None
    values = []
    for raw in match.groups():
        try:
            values.append(float(raw))
        except ValueError:
            values.append(None)
    return tuple(values)


def parse_header(text):
    """Plugin name, loaded flag, skills and slash commands from the header of a final.txt."""
    head = {"plugin": None, "loaded": None, "skills": [], "slash": [], "own": []}
    for match in HEADER.finditer(text.split("COMMANDS RUN:", 1)[0]):
        key, value = match.group(1), match.group(2).strip()
        if key == "PLUGIN_NAME":
            head["plugin"] = value or None
        elif key == "PLUGIN_LOADED":
            head["loaded"] = {"yes": True, "no": False}.get(value)
        else:
            items = [] if value in ("", "none") else [v.strip().lstrip("/") for v in value.split(",") if v.strip()]
            field = {"PLUGIN_SKILLS": "own", "SKILLS": "skills", "SLASH": "slash"}[key]
            head[field] = items
    return head


def invoked(head):
    """True when the plugin loaded and one of its skills or slash commands ran.

    A name counts when it carries the plugin's prefix, or when it is unprefixed
    and matches a skill the init event lists for this plugin.
    """
    name = head["plugin"]
    if not name or not head["loaded"]:
        return False
    prefix = name + ":"
    if any(item.startswith(prefix) for item in head["skills"] + head["slash"]):
        return True
    own = set(head["own"])
    return any(item in own for item in head["skills"] + head["slash"] if ":" not in item)


def extract_json(text):
    """Parses the object from the first "{" to the last "}" in a model reply."""
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start:end + 1])


def parse_grade(obj, numbers, labels):
    """{label: {n: verdict}} for the criterion numbers asked. A criterion the reply does not mention has pass None (no vote)."""
    if not isinstance(obj, dict):
        raise ValueError("reply is not a JSON object")
    result = {}
    for label in labels:
        entries = obj.get(label)
        if not isinstance(entries, list):
            raise ValueError("missing list for label " + label)
        seen = {}
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get("n"), int):
                raise ValueError("bad criterion entry for label " + label)
            if not isinstance(entry.get("pass"), bool):
                raise ValueError("pass is not true or false for label " + label)
            seen[entry["n"]] = {
                "n": entry["n"],
                "pass": entry["pass"],
                "reason": str(entry.get("reason", "")),
            }
        result[label] = {n: seen.get(n, {"n": n, "pass": None, "reason": "no verdict in reply"}) for n in numbers}
    return result


def blind_prompt(task, truth, answers, numbers):
    """The grader's prompt. answers maps each label to (text, mailmap or None); numbers are the criteria the model judges."""
    labels = sorted(answers)
    lines = [
        "You grade %d answers to one task about a git repository." % len(labels),
        "For each criterion listed and each answer, decide pass (true) or fail (false) and give a one-line reason.",
        "Use the ground truth for every number. A criterion that asks for a hedge passes only when the answer hedges.",
        'Reply with ONLY a JSON object: {%s}' % ", ".join('"%s": [{"n": %d, "pass": true, "reason": "..."}]' % (lab, numbers[0]) for lab in labels),
        "with one entry per listed criterion, using its number n (%s)." % ", ".join(str(n) for n in numbers),
        "",
        "TASK PROMPT:",
        task["prompt"],
        "",
        "CRITERIA:",
    ]
    for n in numbers:
        lines.append("%d. %s" % (n, task["criteria"][n - 1]))
    lines += ["", "GROUND TRUTH (computed by a script with git blame):", truth.rstrip(), ""]
    for label in labels:
        text, mailmap = answers[label]
        lines += ["=== ANSWER %s ===" % label, text.rstrip()]
        if mailmap is not None:
            lines += ["", "FILE .mailmap written by this run", mailmap.rstrip()]
        lines.append("")
    return "\n".join(lines)


def call_grader(prompt, cwd):
    proc = subprocess.run(
        [
            "claude", "-p",
            "--model", os.environ.get("GRADER_MODEL", "claude-sonnet-5-5"),
            "--setting-sources", "project",
            "--strict-mcp-config",
            "--output-format", "json",
        ],
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=cwd,
    )
    if proc.returncode != 0:
        raise RuntimeError("claude exited %d: %s" % (proc.returncode, proc.stderr.strip()[:300]))
    return proc.stdout


def reply_text(raw):
    """The model's text from the --output-format json envelope, or the raw text."""
    try:
        envelope = json.loads(raw)
    except ValueError:
        return raw
    if isinstance(envelope, dict) and isinstance(envelope.get("result"), str):
        return envelope["result"]
    return raw


def reply_parses(raw, numbers, labels):
    try:
        parse_grade(extract_json(reply_text(raw)), numbers, labels)
        return True
    except (ValueError, TypeError):
        return False


def grade_votes(prompt, cwd, cache_prefix, numbers, labels):
    """Three independent calls for one cell, three at a time. A reply on disk is reused, not asked again.
    Returns (votes, reasons, problems); problems names the calls that failed or did not parse."""
    def one(index):
        path = "%s.call%d.out" % (cache_prefix, index + 1)
        raw = read_text(path)
        # A cached reply that does not parse is not kept: the call is made again, so one bad file cannot stick.
        if raw is not None and reply_parses(raw, numbers, labels):
            return raw, None
        try:
            raw = call_grader(prompt, cwd)
        except (OSError, RuntimeError) as exc:
            return None, "call %d failed: %s" % (index + 1, str(exc)[:200])
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(raw)
        return raw, None

    with ThreadPoolExecutor(max_workers=VOTES) as pool:
        outcomes = list(pool.map(one, range(VOTES)))
    replies = [raw for raw, _ in outcomes]
    problems = [problem for _, problem in outcomes if problem]
    problems += ["call %d did not parse" % (i + 1) for i, raw in enumerate(replies) if raw is not None and not reply_parses(raw, numbers, labels)]
    votes, reasons = vote_matrix(replies, numbers, labels)
    return votes, reasons, problems


# ---- scripted checks --------------------------------------------------------
# A check decides a criterion without a model when the criterion is a number, a name,
# a file or a fixed phrase. The rules are lenient on purpose: a hedged mention counts.

NUMBER_WINDOW = 140
LONG_LINE = 240
PAIR_WINDOW = 160
DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
HEX_ID = re.compile(r"\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b")
EMAIL = re.compile(r"[\w.+-]+@[\w.-]+")
NUMBER = re.compile(r"(?<![\w.])(\d+(?:,\d{3})*(?:\.\d+)?)(%?)")
FINAL = "FINAL ANSWER:"


META_END = re.compile(r"^META cost=")


def answer_text(text):
    """The original text after the line FINAL ANSWER: and before the META cost line. Empty when there is no answer section."""
    lines = text.split("\n")
    for start, line in enumerate(lines):
        if line.startswith(FINAL):
            rest = [line[len(FINAL):].lstrip(" ")]
            if rest[0] == "":
                rest = []
            for item in lines[start + 1:]:
                if META_END.match(item):
                    break
                rest.append(item)
            return "\n".join(rest)
    return ""


def clean_numbers(line):
    """The line with dates, short shas and e-mail addresses blanked to spaces, so positions do not move."""
    for pattern in (DATE, HEX_ID, EMAIL):
        line = pattern.sub(lambda m: " " * len(m.group(0)), line)
    return line


def alias_spans(line, alias):
    """Start and end of each occurrence of an alias, case-insensitive. A word edge must be a word edge."""
    before = r"(?<!\w)" if alias[:1].isalnum() else ""
    after = r"(?!\w)" if alias[-1:].isalnum() else ""
    return [m.span() for m in re.finditer(before + re.escape(alias) + after, line, re.I)]


def check_number_near(check, answer):
    """Passes when a number of the right unit sits near an alias, on the same line (a long line: 140 characters either side)."""
    ranges = check["ranges"]
    for line in answer.split("\n"):
        cleaned = clean_numbers(line)
        tokens = []
        for m in NUMBER.finditer(cleaned):
            value = float(m.group(1).replace(",", ""))
            tokens.append((m.start(), value, m.group(2) == "%", m.group(0)))
        for alias in (a for group in check["names"] for a in group):
            for start, end in alias_spans(line, alias):
                low, high = (0, len(line)) if len(line) <= LONG_LINE else (max(0, start - NUMBER_WINDOW), end + NUMBER_WINDOW)
                for pos, value, is_percent, text in tokens:
                    if not low <= pos < high:
                        continue
                    for rng in ranges:
                        wants_percent = rng["unit"] == "percent"
                        if wants_percent != is_percent or rng["unit"] not in ("lines", "count", "percent"):
                            continue
                        if rng["min"] <= value <= rng["max"]:
                            return True, "script: matched %s near %s (%s, %s to %s)" % (text, alias, rng["unit"], rng["min"], rng["max"])
    return False, "script: no number of the right unit in %s to %s near any name" % (ranges[0]["min"], ranges[0]["max"])


def first_position(answer, group):
    """The earliest position of any alias of a group in the answer, or None."""
    spots = [start for alias in group for start, _ in alias_spans(answer, alias)]
    return min(spots) if spots else None


def check_first_named(check, answer):
    """The alias group that appears first must be the group at index expect."""
    found = [(first_position(answer, group), index) for index, group in enumerate(check["names"])]
    found = [item for item in found if item[0] is not None]
    if not found:
        return False, "script: none of the listed names appears"
    _, index = min(found)
    ok = index == check["expect"]
    return ok, "script: first named group is %d, expected %d" % (index, check["expect"])


def check_named_with(check, answer):
    """At least min alias groups appear. Two aliases of one group count once."""
    count = sum(1 for group in check["names"] if first_position(answer, group) is not None)
    return count >= check["min"], "script: %d of the listed groups appear, need %d" % (count, check["min"])


def check_co_occur(check, answer):
    """Some line holds an alias of a and an alias of b. A line over 160 characters needs the two within 160 characters."""
    for line in answer.split("\n"):
        spots_a = [s for alias in check["a"] for s, _ in alias_spans(line, alias)]
        spots_b = [s for alias in check["b"] for s, _ in alias_spans(line, alias)]
        if not spots_a or not spots_b:
            continue
        if len(line) <= PAIR_WINDOW or any(abs(x - y) <= PAIR_WINDOW for x in spots_a for y in spots_b):
            return True, "script: one line holds %s and %s" % (check["a"][0], check["b"][0])
    return False, "script: no line holds both %s and %s" % (check["a"][0], check["b"][0])


def check_regex(check, answer):
    """regex_all needs every pattern; regex_any needs one."""
    hits = [bool(re.search(pattern, answer)) for pattern in check["patterns"]]
    if check["type"] == "regex_all":
        missing = [p for p, hit in zip(check["patterns"], hits) if not hit]
        return not missing, "script: all patterns found" if not missing else "script: missing pattern %s" % missing[0]
    return any(hits), "script: a pattern found" if any(hits) else "script: no pattern found"


def one_address(line):
    """True when the line has at least two angle-bracket addresses and they are all one address (compared without case).

    One bracket is not enough: a line with a single address and no person's name is a bare claim, not a unification.
    """
    brackets = re.findall(r"<([^>]*)>", line)
    return len(brackets) >= 2 and len({a.lower() for a in brackets}) == 1


def check_mailmap(check, text):
    """The run's .mailmap maps the address (the last angle bracket) to the person, and no other line merges anyone else.

    With allowSameAddress, a line that does not name the person is still allowed when it repeats one address at
    least twice (Name <a> alias <a>): that is one person written under two names, not a merge of two people.
    """
    lines = [] if text is None else [l.strip() for l in text.split("\n") if l.strip() and not l.lstrip().startswith("#")]
    if not lines:
        return False, "script: no mailmap.txt, or it is empty"
    first = check["person"].split()[0].lower()
    allow_same = check.get("allowSameAddress", False)
    for line in lines:
        if first in line.lower() or (allow_same and one_address(line)):
            continue
        return False, "script: a mailmap line does not name %s: %s" % (first, line)
    brackets = [re.findall(r"<([^>]*)>", line) for line in lines]
    if not any(b and b[-1].lower() == check["address"].lower() for b in brackets):
        return False, "script: no mailmap line maps %s" % check["address"]
    return True, "script: mailmap maps %s to %s" % (check["address"], check["person"])


def script_result(check, answer, mailmap):
    """(pass, reason) of one script check. mailmap is the text of the run's mailmap.txt, or None."""
    kind = check["type"]
    if kind == "number_near":
        return check_number_near(check, answer)
    if kind == "first_named":
        return check_first_named(check, answer)
    if kind == "named_with":
        return check_named_with(check, answer)
    if kind == "co_occur":
        return check_co_occur(check, answer)
    if kind in ("regex_all", "regex_any"):
        return check_regex(check, answer)
    if kind == "mailmap":
        return check_mailmap(check, mailmap)
    raise ValueError("unknown check type: %s" % kind)


def script_verdicts(checks, answer, mailmap):
    """{criterion number: (pass, reason)} for every criterion that has a script check."""
    return {n: script_result(check, answer, mailmap) for n, check in enumerate(checks, start=1) if check is not None}


def majority(votes):
    """True or False by the majority of the valid votes (two of three); None when fewer than two votes are valid.
    A split of two valid votes is not a majority and fails."""
    valid = [v for v in votes if v is not None]
    if len(valid) < 2:
        return None
    return sum(1 for v in valid if v) * 2 > len(valid)


def unanimous(votes):
    """True when all three calls gave a vote and the votes agree."""
    return len(votes) == VOTES and None not in votes and len(set(votes)) == 1


def vote_matrix(replies, numbers, labels):
    """(votes, reasons). votes[label][n] lists one vote per call, None for a call that failed or did not parse;
    reasons[label][n] holds the reason of each call in the same order."""
    votes = {label: {n: [None] * len(replies) for n in numbers} for label in labels}
    reasons = {label: {n: [""] * len(replies) for n in numbers} for label in labels}
    for index, raw in enumerate(replies):
        if raw is None:
            continue
        try:
            parsed = parse_grade(extract_json(reply_text(raw)), numbers, labels)
        except (ValueError, TypeError):
            continue
        for label in labels:
            for n in numbers:
                votes[label][n][index] = parsed[label][n]["pass"]
                reasons[label][n][index] = parsed[label][n]["reason"]
    return votes, reasons


def first_agreeing_reason(votes, decided, reasons):
    """The reason of the first call that voted with the majority."""
    for vote, reason in zip(votes, reasons):
        if vote is not None and vote == decided:
            return reason
    return ""


def compute_agreement(scores, tasks):
    """Per task and overall: criteria by method, (cell, criterion) pairs by method, and unanimous model pairs."""
    result = {}
    total = {"script_criteria": 0, "model_criteria": 0, "script_pairs": 0, "model_pairs": 0, "unanimous": 0}
    for task in tasks:
        checks = task.get("checks") or [None] * len(task["criteria"])
        row = dict.fromkeys(total, 0)
        row["script_criteria"] = sum(1 for c in checks if c is not None)
        row["model_criteria"] = len(checks) - row["script_criteria"]
        for arm_runs in scores.get(task["id"], {}).values():
            for record in arm_runs.values():
                for crit in record.get("criteria", []):
                    if crit.get("error") is not None:
                        continue
                    if crit.get("method") == "script":
                        row["script_pairs"] += 1
                    else:
                        row["model_pairs"] += 1
                        row["unanimous"] += 1 if unanimous(crit.get("votes") or []) else 0
        result[task["id"]] = row
        for key in total:
            total[key] += row[key]
    total["unanimous_share"] = total["unanimous"] / total["model_pairs"] if total["model_pairs"] else None
    decided = total["script_pairs"] + total["model_pairs"]
    total["script_share"] = total["script_pairs"] / decided if decided else None
    result["overall"] = total
    return result


def checks_for(task):
    """The checks of a task, one per criterion (None for a criterion the model judges)."""
    checks = task.get("checks")
    if not isinstance(checks, list) or len(checks) != len(task["criteria"]):
        raise ValueError("%s: checks must hold one entry per criterion" % task["id"])
    return checks


# ---- report -----------------------------------------------------------------

def ok_runs(scores, task_id, arm):
    """Records of one task and arm that carry verdicts (an error leaves none)."""
    return [r for r in scores.get(task_id, {}).get(arm, {}).values() if r.get("criteria")]


def pass_count(record, kind=None):
    return sum(1 for c in record["criteria"] if c["pass"] and c.get("error") is None and (kind is None or c["kind"] == kind))


def possible(record, kind=None):
    """Criteria with a verdict. A criterion that errored is left out, so it neither passes nor counts."""
    return sum(1 for c in record["criteria"] if c.get("error") is None and (kind is None or c["kind"] == kind))


def mark(c):
    """One criterion in the per-run table: 1 pass, 0 fail, E error, * after a model verdict whose votes were not unanimous."""
    if c.get("error") is not None:
        return "E"
    token = "1" if c["pass"] else "0"
    if c.get("method") == "model" and not unanimous(c.get("votes") or []):
        token += "*"
    return token


def share_text(part, whole):
    return "n/a" if not whole else "%d of %d (%.1f%%)" % (part, whole, 100.0 * part / whole)


def agreement_section(scores, tasks):
    """The grading method, the script and model counts, and how often the three model votes were unanimous."""
    agree = compute_agreement(scores, tasks)
    overall = agree["overall"]
    out = ["## Grading method and agreement", ""]
    out += [
        "A check in tasks.json decides a criterion by script: a number near a name, the order of names, names that appear "
        "together, a file pattern or the mailmap. The model decides every other criterion. Each model-judged cell is graded by "
        "three independent calls, and the criterion takes the majority of the three votes (two of three). A criterion with fewer "
        "than two valid votes is an error and is left out of the counts.",
        "",
        "The scripted rules are lenient: a hedged mention counts, so \"probably 812 lines\" passes a number check. "
        "A script can pass an answer that a careful reader would fail.",
        "",
        "In the per-run table, E marks a criterion with an error, and * after a model verdict marks votes that were not unanimous.",
        "",
        "| Task | Script-checked criteria | Model-judged criteria | Pairs decided by script | Pairs judged by model | Unanimous model pairs |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for t in tasks:
        row = agree[t["id"]]
        out.append("| %s | %d | %d | %d | %d | %s |" % (
            t["id"], row["script_criteria"], row["model_criteria"], row["script_pairs"], row["model_pairs"],
            share_text(row["unanimous"], row["model_pairs"]),
        ))
    out.append("| Overall | %d | %d | %d | %d | %s |" % (
        overall["script_criteria"], overall["model_criteria"], overall["script_pairs"], overall["model_pairs"],
        share_text(overall["unanimous"], overall["model_pairs"]),
    ))
    out.append("")
    script_share = "n/a" if overall["script_share"] is None else "%.1f%%" % (100.0 * overall["script_share"])
    out.append("Pairs decided by script: %s of the scored (cell, criterion) pairs. Model-judged pairs with three unanimous votes: %s."
               % (script_share, share_text(overall["unanimous"], overall["model_pairs"])))
    out.append("")
    return out


def stat(scores, task_id, arm, kind=None):
    """(mean, min, max, runs) of passed criteria over the scored runs, or None."""
    values = [pass_count(r, kind) for r in ok_runs(scores, task_id, arm)]
    if not values:
        return None
    return sum(values) / len(values), min(values), max(values), len(values)


def arm_status(scores, arm):
    """run, or the reason an arm is not an opponent. Decided per arm over all its runs."""
    records = [r for task in scores.values() for r in task.get(arm, {}).values()]
    if not records:
        return "not run: no runs"
    loaded = [r.get("loaded") for r in records]
    if any(v is True for v in loaded):
        return "run"
    if any(v is False for v in loaded):
        return NOT_LOADED
    return "not run: plugin load not recorded"


def fmt(value):
    return "n/a" if value is None else "%.2f" % value


def cell_text(scores, task, arm, status, kind=None):
    if arm not in arms_for_task(task):
        return "not in task"
    if status[arm] != "run" and arm in ("pp", "ppi"):
        return "not run"
    found = stat(scores, task["id"], arm, kind)
    if found is None:
        return "no scored run"
    mean, low, high, runs = found
    return "mean %.2f (min %d, max %d, runs %d)" % (mean, low, high, runs)


def project_pilot_rep(scores, task_id, status):
    """(arm, mean) of the higher of pp and ppi on this task, counting only arms that ran."""
    options = []
    for arm in ("pp", "ppi"):
        if status[arm] != "run":
            continue
        found = stat(scores, task_id, arm, "outcome")
        if found is not None:
            options.append((arm, found[0]))
    if not options:
        return None
    return max(options, key=lambda option: option[1])


def win_rule(scores, tasks, status):
    """Outcome-only win rule. Returns (lines, overall) where overall is yes, no or n/a.

    A competitor that is running but has no scored run on some task makes the
    total incomplete, and the total verdict is "no (incomplete)": a missing task
    is never dropped from the sum.
    """
    lines = []
    verdicts = []
    ours_total = 0.0
    ours_complete = True
    totals = {"project-pilot": 0.0, "base": 0.0}
    missing = {"project-pilot": [], "base": []}
    for task in tasks:
        tid = task["id"]
        ours = stat(scores, tid, "ours", "outcome")
        rep = project_pilot_rep(scores, tid, status)
        base = stat(scores, tid, "base", "outcome") if status["base"] == "run" else None
        opponents = []
        if rep is not None:
            opponents.append(("project-pilot (%s)" % rep[0], rep[1]))
        if base is not None:
            opponents.append(("base", base[0]))
        if ours is None or not opponents or status["ours"] != "run":
            verdict = "n/a"
        else:
            verdict = "yes" if all(ours[0] > value for _, value in opponents) else "no"
        verdicts.append(verdict)
        against = ", ".join("%s %.2f" % (name, value) for name, value in opponents) or "no opponent scored"
        lines.append("- %s: ours %s against %s: %s" % (tid, fmt(ours[0] if ours else None), against, verdict))
        if ours is None:
            ours_complete = False
        else:
            ours_total += ours[0]
        if rep is None:
            if project_pilot_rep_any(status):
                missing["project-pilot"].append(tid)
        else:
            totals["project-pilot"] += rep[1]
        if status["base"] == "run":
            if base is None:
                missing["base"].append(tid)
            else:
                totals["base"] += base[0]
    for arm in ("pp", "ppi"):
        if status[arm] != "run":
            lines.append("- %s: %s; no win is counted against it" % (arm, status[arm]))
    if status["base"] != "run":
        lines.append("- base: %s; base is not an opponent" % status["base"])

    if status["ours"] != "run":
        lines.append("- Total: n/a (ours was not run: %s)" % status["ours"])
        total_verdict = "n/a"
    elif not ours_complete:
        lines.append("- Total: n/a (a cell has no scored run)")
        total_verdict = "n/a"
    else:
        running = {"project-pilot": project_pilot_rep_any(status), "base": status["base"] == "run"}
        blocked = [name for name in ("project-pilot", "base") if running[name] and missing[name]]
        if blocked:
            parts = ["%s has no scored run on %s" % (name, ", ".join(missing[name])) for name in blocked]
            total_verdict = "no (incomplete)"
            lines.append("- Total: incomplete: %s, total: %s" % ("; ".join(parts), total_verdict))
        else:
            candidates = [(name, totals[name]) for name in ("project-pilot", "base") if running[name]]
            if not candidates:
                lines.append("- Total: n/a (no opponent scored)")
                total_verdict = "n/a"
            else:
                name, higher = max(candidates, key=lambda candidate: candidate[1])
                need = WIN_MARGIN * higher
                total_verdict = "yes" if ours_total >= need - EPSILON else "no"
                lines.append(
                    "- Total: ours %.2f, higher other total %.2f (%s), needs at least %.2f: %s"
                    % (ours_total, higher, name, need, total_verdict)
                )
    if "no" in verdicts or total_verdict.startswith("no"):
        overall = "no"
    elif "n/a" in verdicts or total_verdict == "n/a":
        overall = "n/a"
    else:
        overall = "yes"
    lines.append("- Overall: %s" % overall)
    return lines, overall


def project_pilot_rep_any(status):
    return status["pp"] == "run" or status["ppi"] == "run"


def compute_results(scores, tasks, model, date):
    """Markdown report from scores[task][arm][run] (see main for the shape)."""
    task_ids = [t["id"] for t in tasks]
    by_id = {t["id"]: t for t in tasks}
    status = {arm: arm_status(scores, arm) for arm in ARMS}
    graded = [t for t in task_ids if any(ok_runs(scores, t, arm) for arm in ARMS)]
    out = [
        "# Head-to-head results, model %s" % model,
        "",
        "On these %d tasks, model %s, date %s: the arms, criteria and tasks are those in tasks.json. "
        "This report makes no claim beyond these tasks, this model and this date."
        % (len(graded), model, date),
        "",
        "Arms: ours (this repository), pp (project-pilot as it loads), ppi (project-pilot with its command invoked, "
        "where the task has one), base (no plugin).",
        "",
    ]

    out += ["## Plugin loading", "", "| Arm | Status | Runs with plugin loaded | Runs with a skill or command invoked | Runs |", "| --- | --- | --- | --- | --- |"]
    for arm in ARMS:
        records = [r for t in task_ids for r in scores.get(t, {}).get(arm, {}).values()]
        out.append("| %s | %s | %d | %d | %d |" % (
            arm,
            status[arm],
            sum(1 for r in records if r.get("loaded") is True),
            sum(1 for r in records if r.get("invoked") is True),
            len(records),
        ))
    out.append("")

    out += ["## Outcome criteria only (mean, min and max of criteria passed per run)", ""]
    out += ["| Task | Outcome criteria | " + " | ".join(ARMS) + " |", "| --- | --- | --- | --- | --- | --- |"]
    for t in task_ids:
        ncrit = sum(1 for k in kinds_for(by_id[t]) if k == "outcome")
        cells = [cell_text(scores, by_id[t], arm, status, "outcome") for arm in ARMS]
        out.append("| %s | %d | %s |" % (t, ncrit, " | ".join(cells)))
    out.append("")

    out += ["## All criteria (outcome and process)", ""]
    out += ["| Task | All criteria | " + " | ".join(ARMS) + " |", "| --- | --- | --- | --- | --- | --- |"]
    for t in task_ids:
        cells = [cell_text(scores, by_id[t], arm, status, None) for arm in ARMS]
        out.append("| %s | %d | %s |" % (t, len(by_id[t]["criteria"]), " | ".join(cells)))
    out.append("")

    out += ["## Process criteria (listed separately, not in the win rule)", ""]
    rows = []
    for t in task_ids:
        task = by_id[t]
        kinds = kinds_for(task)
        for index, kind in enumerate(kinds):
            if kind != "process":
                continue
            counts = []
            for arm in ARMS:
                if arm not in arms_for_task(task):
                    counts.append("not in task")
                    continue
                if status[arm] != "run" and arm in ("pp", "ppi"):
                    counts.append("not run")
                    continue
                # A run whose verdict on this criterion errored is left out of both numbers.
                recs = [r for r in ok_runs(scores, t, arm) if r["criteria"][index].get("error") is None]
                if not recs:
                    counts.append("no scored run")
                    continue
                passed = sum(1 for r in recs if r["criteria"][index]["pass"])
                counts.append("%d of %d runs" % (passed, len(recs)))
            rows.append("| %s | %d. %s | %s |" % (t, index + 1, task["criteria"][index], " | ".join(counts)))
    if rows:
        out += ["| Task | Process criterion | " + " | ".join(ARMS) + " |", "| --- | --- | --- | --- | --- | --- |"] + rows
    else:
        out.append("No task has a process criterion.")
    out.append("")

    out += ["## Per-run scores", "", "| Task | Arm | Run | All criteria | Outcome criteria | Per criterion (1 pass, 0 fail) |", "| --- | --- | --- | --- | --- | --- |"]
    for t in task_ids:
        for arm in ARMS:
            for n in sorted(scores.get(t, {}).get(arm, {}), key=int):
                run = scores[t][arm][n]
                if not run.get("criteria"):
                    out.append("| %s | %s | %s | error | error | %s |" % (t, arm, n, run.get("error") or "no verdict"))
                    continue
                marks = " ".join(mark(c) for c in run["criteria"])
                out.append("| %s | %s | %s | %d of %d | %d of %d | %s |" % (
                    t, arm, n,
                    pass_count(run), possible(run),
                    pass_count(run, "outcome"), possible(run, "outcome"),
                    marks,
                ))
    out.append("")

    lines, _ = win_rule(scores, [by_id[t] for t in task_ids], status)
    out += ["## Win rule (outcome criteria only)", ""]
    out += lines
    out += [
        "",
        "Project-pilot is represented on each task by the higher of its pp and ppi outcome means. "
        "An arm whose plugin never loaded is not an opponent.",
        "",
    ]

    costs_block = ["| Arm | mean cost (USD) | mean turns | runs with META |", "| --- | --- | --- | --- |"]
    for arm in ARMS:
        costs, turns, count = [], [], 0
        for t in task_ids:
            for run in scores.get(t, {}).get(arm, {}).values():
                meta = run.get("meta")
                if not meta:
                    continue
                count += 1
                if meta[0] is not None:
                    costs.append(meta[0])
                if meta[2] is not None:
                    turns.append(meta[2])
        mean_cost = "n/a" if not costs else "%.4f" % (sum(costs) / len(costs))
        mean_turns = "n/a" if not turns else "%.1f" % (sum(turns) / len(turns))
        costs_block.append("| %s | %s | %s | %d |" % (arm, mean_cost, mean_turns, count))
    out += ["## Cost and turns (from META lines, per run)", ""] + costs_block

    out += agreement_section(scores, tasks)
    errors = [
        "%s %s run %s: %s" % (t, arm, n, run["error"])
        for t in task_ids
        for arm in ARMS
        for n, run in scores.get(t, {}).get(arm, {}).items()
        if run.get("error")
    ]
    if errors:
        out += ["", "## Grading errors", ""] + ["- " + e for e in errors]
    return "\n".join(out) + "\n"


def runs_available(out, tasks):
    """Task id -> sorted run numbers where every arm of the task has a final.txt."""
    runs_dir = os.path.join(out, "runs")
    if not os.path.isdir(runs_dir):
        return {}
    needed = {t["id"]: set(arms_for_task(t)) for t in tasks}
    found = {}
    for name in os.listdir(runs_dir):
        match = RUN_DIR.match(name)
        if not match or not os.path.exists(os.path.join(runs_dir, name, "final.txt")):
            continue
        task, arm, n = match.group(1), match.group(2), int(match.group(3))
        found.setdefault((task, n), set()).add(arm)
    ready = {}
    for (task, n), arms in found.items():
        if task in needed and needed[task] <= arms:
            ready.setdefault(task, []).append(n)
    return {task: sorted(ns) for task, ns in ready.items()}


def truth_cache_path(cache_dir, variant, script):
    """The cache file for one fixture's truth. The name carries a digest of truth.py, so an
    old cache written before a change to the script (new sections, say) is never read back."""
    with open(script, "rb") as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()[:12]
    return os.path.join(cache_dir, "truth-%s-%s.txt" % (variant, digest))


def truth_for(out, variant, cache_dir):
    cache = truth_cache_path(cache_dir, variant, os.path.join(HERE, "truth.py"))
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as fh:
            return fh.read()
    fixtures = os.path.join(out, "fixtures")
    with open(os.path.join(fixtures, "reformat-sha.txt"), encoding="utf-8") as fh:
        sha = fh.read().strip()
    proc = subprocess.run(
        [sys.executable, "-I", os.path.join(HERE, "truth.py"), os.path.join(fixtures, variant), "--ignore-rev", sha],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    with open(cache, "w", encoding="utf-8") as fh:
        fh.write(proc.stdout)
    return proc.stdout


def read_text(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def read_model(out):
    return (read_text(os.path.join(out, "MODEL")) or "").strip() or "unknown"


def grade_all(out, max_run):
    tasks = load_tasks()
    grade_dir = os.path.join(out, "grade")
    os.makedirs(grade_dir, exist_ok=True)
    ready = runs_available(out, tasks)
    if not ready:
        print("no run has every arm finished under %s/runs" % out, file=sys.stderr)
        return 1
    run_dir = os.path.join(out, "runs")

    plugin_dirs = load_plugin_dirs(out)
    labels = {}
    scores = {}
    for task in tasks:
        tid = task["id"]
        arms = arms_for_task(task)
        kinds = kinds_for(task)
        checks = checks_for(task)
        model_ns = [n for n, check in enumerate(checks, start=1) if check is None]
        for n in ready.get(tid, []):
            if max_run is not None and n > max_run:
                continue
            key = "%s-%d" % (tid, n)
            finals = {}
            mailmaps = {}
            for arm in arms:
                cell = os.path.join(run_dir, "%s-%s-%d" % (tid, arm, n))
                finals[arm] = read_text(os.path.join(cell, "final.txt")) or ""
                mailmaps[arm] = read_text(os.path.join(cell, "mailmap.txt"))
            mapping = label_map(tid, n, arms)
            labels[key] = mapping
            scripted = {arm: script_verdicts(checks, answer_text(finals[arm]), mailmaps[arm]) for arm in arms}
            votes, reasons, problems = {}, {}, []
            if model_ns:
                blind = {label: (blind_text(finals[arm], plugin_dirs), mailmaps[arm] if tid == "T3" else None)
                         for label, arm in mapping.items()}
                truth = truth_for(out, task["fixture"], grade_dir)
                prompt = blind_prompt(task, truth, blind, model_ns)
                with open(os.path.join(grade_dir, key + ".in"), "w", encoding="utf-8") as fh:
                    fh.write(prompt)
                votes, reasons, problems = grade_votes(prompt, grade_dir, os.path.join(grade_dir, key),
                                                       model_ns, sorted(mapping))
                print("%s: %s" % (key, "graded" if not problems else "; ".join(problems)))
            else:
                print("%s: script only, no model call" % key)

            for label, arm in mapping.items():
                head = parse_header(finals[arm])
                criteria = []
                for number, check in enumerate(checks, start=1):
                    if check is None:
                        cell_votes = votes[label][number]
                        decided = majority(cell_votes)
                        if decided is None:
                            entry = {"n": number, "pass": None, "reason": "error: fewer than two valid votes", "method": "model",
                                     "votes": cell_votes, "error": "fewer than two valid votes"}
                        else:
                            entry = {"n": number, "pass": decided,
                                     "reason": first_agreeing_reason(cell_votes, decided, reasons[label][number]),
                                     "method": "model", "votes": cell_votes, "error": None}
                    else:
                        ok, reason = scripted[arm][number]
                        entry = {"n": number, "pass": ok, "reason": reason, "method": "script", "votes": None, "error": None}
                    criteria.append(dict(entry, kind=kinds[number - 1]))
                cell_errors = ["criterion %d: fewer than two valid votes" % c["n"] for c in criteria if c["error"]]
                record = {
                    "label": label,
                    "loaded": head["loaded"],
                    "invoked": invoked(head),
                    "meta": read_meta(finals[arm]),
                    "error": "; ".join(cell_errors + problems) or None,
                    "criteria": criteria,
                }
                scores.setdefault(tid, {}).setdefault(arm, {})[str(n)] = record

    with open(os.path.join(grade_dir, "labels.json"), "w", encoding="utf-8") as fh:
        json.dump(labels, fh, indent=2)
    with open(os.path.join(grade_dir, "scores.json"), "w", encoding="utf-8") as fh:
        json.dump(scores, fh, indent=2)
    with open(os.path.join(grade_dir, "RESULTS.md"), "w", encoding="utf-8") as fh:
        fh.write(compute_results(scores, tasks, read_model(out), datetime.date.today().isoformat()))
    lines, overall = win_rule(scores, tasks, {arm: arm_status(scores, arm) for arm in ARMS})
    print("\n".join(lines))
    print("wrote %s and RESULTS.md" % os.path.join(grade_dir, "scores.json"))
    return 0


# ---- self-test --------------------------------------------------------------

def _record(passes, kinds, loaded, invoked_flag=False, meta=None):
    criteria = [{"n": i + 1, "pass": p, "reason": "", "kind": k} for i, (p, k) in enumerate(zip(passes, kinds))]
    return {"label": "A", "loaded": loaded, "invoked": invoked_flag, "meta": meta, "error": None, "criteria": criteria}


def _canned(pp_loaded=True, ppi_loaded=True):
    """Two tasks. T1 has a ppInvokedPrompt and a process criterion; T2 has none."""
    k1 = ["outcome", "outcome", "process"]
    k2 = ["outcome", "outcome"]
    scores = {
        "T1": {
            "ours": {"1": _record([True, True, False], k1, True), "2": _record([True, False, True], k1, True)},
            "pp": {
                "1": _record([True, False, True], k1, pp_loaded),
                "2": _record([False, False, True], k1, pp_loaded),
            },
            # The invoked arm scores higher than the natural pp arm, so it represents project-pilot on T1.
            "ppi": {
                "1": _record([True, True, True], k1, ppi_loaded, ppi_loaded),
                "2": _record([True, True, False], k1, ppi_loaded, ppi_loaded),
            },
            "base": {"1": _record([False, False, False], k1, True), "2": _record([True, False, False], k1, True)},
        },
        "T2": {
            "ours": {"1": _record([True, True], k2, True), "2": _record([True, False], k2, True)},
            "pp": {"1": _record([True, False], k2, pp_loaded)},
            "base": {"1": _record([False, False], k2, True)},
        },
    }
    scores["T1"]["ours"]["1"]["meta"] = (0.5, 1000.0, 4.0)
    return scores


def self_test():
    """Exercises parsing, blinding, labels, the header and the report on canned data. No model call."""
    # Extraction tolerates prose around the object and braces inside strings.
    obj = extract_json('Sure. {"A": [{"n": 1, "pass": true, "reason": "has {braces}"}]} Done.')
    assert obj["A"][0]["reason"] == "has {braces}"
    try:
        extract_json("no braces here")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass

    # A missing criterion is no vote, a bad type is rejected, labels are the ones asked for.
    full = {
        "A": [{"n": 1, "pass": True, "reason": "a"}],
        "B": [{"n": 1, "pass": False, "reason": "b"}, {"n": 2, "pass": True, "reason": "b2"}],
        "C": [{"n": 2, "pass": True, "reason": "c2"}],
    }
    parsed = parse_grade(full, [1, 2], ["A", "B", "C"])
    assert parsed["A"][1]["pass"] is True and parsed["B"][2]["pass"] is True
    assert parsed["A"][2]["pass"] is None and parsed["A"][2]["reason"] == "no verdict in reply"
    assert parsed["C"][1]["pass"] is None
    try:
        parse_grade({"A": [{"n": 1, "pass": "yes"}]}, [1], ["A"])
        raise AssertionError("expected ValueError for string pass")
    except ValueError:
        pass
    try:
        parse_grade({"A": []}, [1], ["A", "B"])
        raise AssertionError("expected ValueError for missing label")
    except ValueError:
        pass

    # Labels are a permutation of the arms that ran, and the same for the same cell.
    mapping = label_map("T1", 1, ARMS)
    assert sorted(mapping.values()) == sorted(ARMS) and sorted(mapping) == LABELS
    assert label_map("T1", 1, ARMS) == mapping
    three = label_map("T2", 1, ["ours", "pp", "base"])
    assert sorted(three.values()) == ["base", "ours", "pp"] and sorted(three) == ["A", "B", "C"]

    # Tasks: ppi only where the task has an invoked prompt; kinds must match the criteria.
    t1 = {"id": "T1", "criteria": ["a", "b", "c"], "criteriaKinds": ["outcome", "outcome", "process"], "ppInvokedPrompt": "x"}
    t2 = {"id": "T2", "criteria": ["a", "b"], "criteriaKinds": ["outcome", "outcome"], "ppInvokedPrompt": None}
    assert arms_for_task(t1) == ["ours", "pp", "ppi", "base"]
    assert arms_for_task(t2) == ["ours", "pp", "base"]
    try:
        kinds_for({"id": "T9", "criteria": ["a"], "criteriaKinds": ["outcome", "process"]})
        raise AssertionError("expected ValueError for kind count")
    except ValueError:
        pass

    # Header: SKILLS, SLASH and PLUGIN lines are removed from the grader's text, META too; answer text stays.
    text = (
        "PLUGIN_NAME: surviving-lines\nPLUGIN_LOADED: yes\nSKILLS: surviving-lines:bus-factor\n"
        "SLASH: none\nCOMMANDS RUN:\nFINAL ANSWER:\nTroy 810\nMETA cost=0.1 ms=5 turns=3\n"
    )
    assert strip_arm_markers(text) == "COMMANDS RUN:\nFINAL ANSWER:\nTroy 810\n", strip_arm_markers(text)
    assert read_meta(text) == (0.1, 5.0, 3.0)
    assert read_meta("no meta here") is None
    assert read_meta("META cost=None ms=None turns=None") == (None, None, None)

    # The invoked flag needs the plugin loaded and a name with the plugin prefix.
    head = parse_header(text)
    assert head["plugin"] == "surviving-lines" and head["loaded"] is True and invoked(head) is True
    assert invoked(parse_header(text.replace("PLUGIN_LOADED: yes", "PLUGIN_LOADED: no"))) is False
    assert invoked(parse_header("PLUGIN_NAME: x\nPLUGIN_LOADED: yes\nSKILLS: none\nSLASH: /x:cmd\nCOMMANDS RUN:\n")) is True
    assert invoked(parse_header("PLUGIN_NAME: x\nPLUGIN_LOADED: yes\nSKILLS: none\nSLASH: none\nCOMMANDS RUN:\n")) is False
    # An unprefixed skill name counts only when the init event lists it as this plugin's skill.
    own = "PLUGIN_NAME: x\nPLUGIN_LOADED: yes\nPLUGIN_SKILLS: bus-factor\nSKILLS: bus-factor\nSLASH: none\nCOMMANDS RUN:\n"
    assert invoked(parse_header(own)) is True
    assert invoked(parse_header(own.replace("\nSKILLS: bus-factor", "\nSKILLS: other"))) is False
    assert invoked(parse_header(own.replace("PLUGIN_SKILLS: bus-factor", "PLUGIN_SKILLS: none"))) is False
    assert strip_arm_markers(own) == "COMMANDS RUN:\n", strip_arm_markers(own)

    # Blinding: a canned transcript with every arm-revealing string in its command lines.
    canned = (
        "PLUGIN_NAME: project-pilot\nPLUGIN_LOADED: yes\nSKILLS: project-pilot:bus-factor\nSLASH: /project-pilot:team\n"
        "COMMANDS RUN:\n"
        " - Skill: project-pilot:bus-factor\n"
        " - Bash: node <home>/work/pp-clone/bin/run.js --x\n"
        " - Bash: node ${CLAUDE_PLUGIN_ROOT}/bin/surviving-lines.js --json\n"
        " - Bash: node <home>/work/sl-clone/bin/surviving-lines.js\n"
        " - Bash: npx surviving-lines --top 3\n"
        " - Skill: surviving-lines:surviving-lines\n"
        " - Bash: ls ~/.claude/plugins/project-pilot/skills\n"
        "FINAL ANSWER:\nUse surviving-lines and project-pilot as you like.\nMETA cost=1 ms=2 turns=3\n"
    )
    seen = blind_text(canned, ["<home>/work/pp-clone", "<home>/work/sl-clone"])
    shown_commands = seen.split("COMMANDS RUN:", 1)[1].split("FINAL ANSWER:", 1)[0]
    for secret in ("project-pilot", "surviving-lines", "pp-clone", "sl-clone", "CLAUDE_PLUGIN_ROOT", "<home>"):
        assert secret not in shown_commands, (secret, shown_commands)
    assert "tool:skill" in shown_commands and "<plugin>" in shown_commands and "<tool>" in shown_commands, shown_commands
    assert "PLUGIN_NAME" not in seen and "META" not in seen
    # The answer text is left as written.
    assert "Use surviving-lines and project-pilot as you like." in seen
    # No COMMANDS RUN part: nothing to neutralise.
    assert neutralise_commands("just text") == "just text"
    # PLUGIN_DIRS: both the recorded path and its real path are read; a missing file gives no directories.
    with tempfile.TemporaryDirectory() as tmp:
        assert load_plugin_dirs(tmp) == []
        with open(os.path.join(tmp, "PLUGIN_DIRS"), "w", encoding="utf-8") as fh:
            json.dump({"ours": {"dir": "<home>/work/sl-clone", "commit": "abc", "version": "1"}, "pp": "<home>/work/pp-clone"}, fh)
        dirs = load_plugin_dirs(tmp)
        assert "<home>/work/sl-clone" in dirs and "<home>/work/pp-clone" in dirs, dirs

    tasks = [{k: v for k, v in t.items()} for t in (t1, t2)]
    for t in tasks:
        t["prompt"] = "p"
        t["fixture"] = "noignore"

    # Main report: the invoked arm is higher than the natural pp arm on T1, so ppi represents project-pilot there.
    scores = _canned()
    status = {arm: arm_status(scores, arm) for arm in ARMS}
    assert status == {"ours": "run", "pp": "run", "ppi": "run", "base": "run"}, status
    assert project_pilot_rep(scores, "T1", status) == ("ppi", 2.0)
    assert project_pilot_rep(scores, "T2", status) == ("pp", 1.0)
    report = compute_results(scores, tasks, "claude-sonnet-5-5", "2026-10-21")
    assert report.startswith("# Head-to-head results, model claude-sonnet-5-5\n"), report[:120]
    assert "On these 2 tasks, model claude-sonnet-5-5, date 2026-10-21" in report
    assert "| T1 | 2 | mean 1.50 (min 1, max 2, runs 2) | mean 0.50 (min 0, max 1, runs 2) | mean 2.00 (min 2, max 2, runs 2) | mean 0.50 (min 0, max 1, runs 2) |" in report, report
    assert "- T1: ours 1.50 against project-pilot (ppi) 2.00, base 0.50: no" in report, report
    assert "- T2: ours 1.50 against project-pilot (pp) 1.00, base 0.00: yes" in report, report
    assert "- Total: ours 3.00, higher other total 3.00 (project-pilot), needs at least 3.60: no" in report, report
    assert "- Overall: no" in report
    assert "| T1 | 3. c |" in report, report  # the process criterion is listed in its own table
    assert "| ours | run | 4 | 0 | 4 |" in report, report
    assert "| ppi | run | 2 | 2 | 2 |" in report, report
    assert "| T1 | ours | 1 | 2 of 3 | 2 of 2 |" in report, report
    assert "| T1 | ours | 2 | 2 of 3 | 1 of 2 |" in report, report

    # Scenario: pp never loaded. It is not an opponent and no win is counted against it. ppi still is.
    scores = _canned(pp_loaded=False)
    status = {arm: arm_status(scores, arm) for arm in ARMS}
    assert status["pp"] == NOT_LOADED, status
    assert project_pilot_rep(scores, "T2", status) is None
    report = compute_results(scores, tasks, "claude-sonnet-5-5", "2026-10-21")
    assert "| pp | not run: plugin did not load |" in report, report
    assert "- pp: not run: plugin did not load; no win is counted against it" in report, report
    assert "- T2: ours 1.50 against base 0.00: yes" in report, report
    assert "| T2 | 2 | mean 1.50 (min 1, max 2, runs 2) | not run |" in report, report
    # project-pilot ran on T1 (its invoked arm) but has no scored run on T2, so the total is incomplete.
    assert "- Total: incomplete: project-pilot has no scored run on T2, total: no (incomplete)" in report, report
    assert "- Overall: no" in report

    # Scenario: project-pilot has a task with no scored run while its other task is scored.
    scores = _canned()
    del scores["T2"]["pp"]
    status = {arm: arm_status(scores, arm) for arm in ARMS}
    lines, overall = win_rule(scores, tasks, status)
    assert "- Total: incomplete: project-pilot has no scored run on T2, total: no (incomplete)" in lines, lines
    assert overall == "no"

    # Boundary: ours at exactly 1.2 times the higher other total passes, a little under it does not.
    def ten(k):
        return _record([True] * k + [False] * (10 - k), ["outcome"] * 10, True)

    one = [{"id": "T1", "criteria": ["c%d" % i for i in range(10)], "criteriaKinds": ["outcome"] * 10, "prompt": "p", "fixture": "noignore"}]
    boundary = {"T1": {
        "ours": {str(i): ten(6) for i in range(1, 6)},
        "base": {str(i): ten(5) for i in range(1, 6)},
    }}
    lines, overall = win_rule(boundary, one, {arm: arm_status(boundary, arm) for arm in ARMS})
    assert "- Total: ours 6.00, higher other total 5.00 (base), needs at least 6.00: yes" in lines, lines
    assert overall == "yes"
    under = {"T1": {
        "ours": {str(i): ten(6 if i < 5 else 5) for i in range(1, 6)},
        "base": {str(i): ten(5) for i in range(1, 6)},
    }}
    lines, overall = win_rule(under, one, {arm: arm_status(under, arm) for arm in ARMS})
    assert "- Total: ours 5.80, higher other total 5.00 (base), needs at least 6.00: no" in lines, lines
    assert overall == "no"

    # Scenario: both project-pilot arms never loaded. Only base is an opponent, and the overall verdict says so.
    scores = _canned(pp_loaded=False, ppi_loaded=False)
    status = {arm: arm_status(scores, arm) for arm in ARMS}
    assert status["ppi"] == NOT_LOADED
    report = compute_results(scores, tasks, "claude-sonnet-5-5", "2026-10-21")
    assert "- T1: ours 1.50 against base 0.50: yes" in report, report
    assert "- Total: ours 3.00, higher other total 0.50 (base), needs at least 0.60: yes" in report, report
    assert "- Overall: yes" in report
    assert "project-pilot (" not in report

    # Vocabulary: the generated report never uses the words that would overstate a result.
    for text_out in (report, compute_results(_canned(), tasks, "m", "d")):
        assert re.search(r"\bbest\b", text_out, re.I) is None
        assert "beats every tool" not in text_out

    # A missing arm makes the verdict n/a rather than a false yes.
    partial = {"T1": {"ours": {"1": _record([True, True, True], ["outcome", "outcome", "process"], True)}}, "T2": {}}
    report = compute_results(partial, tasks, "m", "d")
    assert "- T1: ours 2.00 against no opponent scored: n/a" in report, report
    assert "- Overall: n/a" in report, report

    # An unparsable cached reply is asked again, and the fresh reply is what the cell keeps.
    with tempfile.TemporaryDirectory() as tmp:
        prefix = os.path.join(tmp, "cell")
        with open(prefix + ".call1.out", "w", encoding="utf-8") as fh:
            fh.write("not json at all")
        good = json.dumps({"result": '{"A": [{"n": 1, "pass": true, "reason": "ok"}]}'})
        stub_calls = []

        def stub(prompt, cwd):
            stub_calls.append(cwd)
            return good

        saved = globals()["call_grader"]
        globals()["call_grader"] = stub
        try:
            votes, _, problems = grade_votes("p", tmp, prefix, [1], ["A"])
        finally:
            globals()["call_grader"] = saved
        assert len(stub_calls) == 3 and problems == [], (stub_calls, problems)
        assert votes["A"][1] == [True, True, True], votes
        assert read_text(prefix + ".call1.out") == good

    # A process criterion with an errored verdict in one run is left out of "x of y runs" (the errored run would pass).
    errored = _record([True, True, True], ["outcome", "outcome", "process"], True)
    errored["criteria"][2]["error"] = "fewer than two valid votes"
    tasks_p = [{"id": "T1", "criteria": ["a", "b", "c"], "criteriaKinds": ["outcome", "outcome", "process"], "prompt": "p"}]
    report = compute_results({"T1": {"ours": {"1": _record([True, True, True], ["outcome", "outcome", "process"], True), "2": errored}}}, tasks_p, "m", "d")
    assert "| 1 of 1 runs" in report, report

    # The truth cache follows the script: the same script keeps its cache, a changed script gets a new one.
    with tempfile.TemporaryDirectory() as tmp:
        first = os.path.join(tmp, "first.py")
        second = os.path.join(tmp, "second.py")
        for path, text in ((first, "print(1)\n"), (second, "print(2)\n")):
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(text)
        a = truth_cache_path(tmp, "noignore", first)
        assert a == truth_cache_path(tmp, "noignore", first)
        assert a != truth_cache_path(tmp, "noignore", second)
        assert a != truth_cache_path(tmp, "ignore", first)

    self_test_checks()
    print("self-test OK")
    return 0


def self_test_checks():
    """Scripted checks, vote combination and agreement maths on canned answers. No model call."""
    # The answer is the original text between FINAL ANSWER: and META.
    assert answer_text("COMMANDS RUN:\nls\nFINAL ANSWER:\nTroy 810\nMETA cost=1 ms=2 turns=3\n") == "Troy 810"
    # A line that starts with META but is not the META cost line is part of the answer.
    assert answer_text("FINAL ANSWER:\nMETA is a company\nTroy 810\nMETA cost=1 ms=2 turns=3\n") == "META is a company\nTroy 810"
    assert answer_text("COMMANDS RUN:\nFINAL ANSWER:\nlast line") == "last line"
    assert answer_text("no section here") == ""

    def near(answer, unit, lo, hi, names=(["Troy Goode", "Troy"],)):
        check = {"type": "number_near", "names": list(names), "ranges": [{"unit": unit, "min": lo, "max": hi}]}
        return check_number_near(check, answer)[0]

    # Hedged mentions count. Thousands separators are one number. Percent and plain numbers do not match each other.
    assert near("Troy Goode probably has about 812 lines.", "lines", 780, 840)
    assert near("troy goode: 1,985 lines in total", "lines", 1900, 2000)
    assert not near("Troy Goode: 1,985 lines", "lines", 1, 1000)
    assert near("Troy Goode holds 66.8%", "percent", 60, 72)
    assert not near("Troy Goode holds 66.8%", "lines", 60, 72)
    assert not near("Troy Goode holds 812 lines", "percent", 800, 900)
    assert near("Troy Goode 812 lines, 66.8%", "percent", 60, 72) and near("Troy Goode 812 lines, 66.8%", "count", 780, 840)
    assert not near("Vansh holds 812 lines", "lines", 780, 840), "an alias must be near the number"
    assert near("Douglas Wilson 629", "lines", 600, 660, [["Douglas Christopher Wilson", "Douglas", "Wilson"]])
    # A date and a short sha are not numbers: their digits would fall in these ranges if they were read.
    assert not near("Troy Goode last commit 2026-04-12", "count", 1, 31)
    assert not near("Troy Goode at 5317ebe", "count", 5000, 6000)
    # Long lines: a short line counts whole, a long line only 140 characters either side of the name.
    short = "Troy Goode " + "w " * 90 + "812 lines"
    assert len(short) <= 240 and near(short, "lines", 780, 840)
    far = "Troy Goode " + "w " * 100 + "812 lines" + " tail" * 40
    assert len(far) > 240 and not near(far, "lines", 780, 840)
    close = "Troy Goode " + "w " * 40 + "812 lines" + " tail" * 40
    assert len(close) > 240 and near(close, "lines", 780, 840)

    groups = [["Troy Goode", "Troy"], ["Douglas Christopher Wilson", "Douglas", "Wilson"], ["Vansh"]]

    def first(answer, expect):
        return check_first_named({"type": "first_named", "names": groups, "expect": expect}, answer)[0]

    assert first("Troy Goode first, then Douglas", 0)
    assert not first("Douglas first, then Troy Goode", 0)
    assert first("Douglas first, then Troy Goode", 1)
    assert not first("nobody from the list", 0)

    def named(answer, minimum):
        return check_named_with({"type": "named_with", "names": groups, "min": minimum}, answer)[0]

    assert named("Troy and Vansh", 2)
    assert not named("Troy and Vansh", 3)
    assert not named("Douglas Christopher Wilson and Wilson", 2), "two aliases of one group count once"

    def co(answer, a, b):
        return check_co_occur({"type": "co_occur", "a": a, "b": b}, answer)[0]

    table = "| .yml | Douglas Christopher Wilson | 127 |\n| .md | Troy Goode | 116 |"
    assert co(table, [".yml", "yml"], ["Douglas Christopher Wilson", "Douglas", "Wilson"])
    assert not co(table, [".yml", "yml"], ["Troy Goode", "Troy"]), "the two names are on different rows"
    assert not co("yml " + "x " * 100 + "Douglas", ["yml"], ["Douglas"]), "a long line needs both within 160 characters"
    assert co("yml " + "x " * 20 + "Douglas" + " y" * 200, ["yml"], ["Douglas"])

    all_check = {"type": "regex_all", "patterns": ["troy@laptop\\.example", "troygoode@"]}
    assert check_regex(all_check, "a troy@laptop.example and troygoode@x")[0]
    assert not check_regex(all_check, "only troy@laptop.example")[0]
    any_check = {"type": "regex_any", "patterns": ["(?i)\\bguess", "(?i)unless"]}
    assert check_regex(any_check, "It is a Guess.")[0]
    assert not check_regex(any_check, "Certain.")[0]

    def mailmap(text, address="troy@laptop.example", allow=False):
        check = {"type": "mailmap", "person": "Troy Goode", "address": address}
        if allow:
            check["allowSameAddress"] = True
        return check_mailmap(check, text)[0]

    assert mailmap("# note\n\nTroy Goode <troy@laptop.example>\n")
    assert mailmap("Troy Goode <TROY@laptop.example>\n"), "addresses compare without case"
    assert not mailmap(None), "a missing mailmap.txt fails"
    assert not mailmap("# only a comment\n\n"), "an empty mailmap.txt fails"
    assert not mailmap("Troy Goode <troygoode@other.example>\n"), "no line maps the address"
    assert not mailmap("Troy Goode <troy@laptop.example>\nDouglas Christopher Wilson <douglas@x.example>\n"), "another person is merged"

    # The same-address rule: a line with one address under two names is a name-only unification.
    unify = "Troy Goode <troy@laptop.example>\nAlejandro Caravaca Puchades <a@x.example> alex94puchades <a@x.example>\n"
    assert mailmap(unify, allow=True), "a same-address unification passes with the flag"
    assert not mailmap(unify), "without the flag the unification line fails, as before"
    assert not mailmap(None, allow=True), "a missing mailmap.txt fails with the flag"
    assert not mailmap("# only a comment\n\n", allow=True), "an empty mailmap.txt fails with the flag"
    two_people = "Troy Goode <troy@laptop.example>\nPerson One <one@x.example> Person Two <two@x.example>\n"
    assert not mailmap(two_people, allow=True), "a line mapping two different addresses of two people fails"
    ok, reason = check_mailmap({"type": "mailmap", "person": "Troy Goode", "address": "troy@laptop.example", "allowSameAddress": True}, two_people)
    assert not ok and "Person One <one@x.example>" in reason, reason
    assert not mailmap("Troy Goode <troy@laptop.example>\nPerson One <one@x.example>\n", allow=True), "one address under one name, with no name of the person, fails even with the flag"
    ok, reason = check_mailmap({"type": "mailmap", "person": "Troy Goode", "address": "troy@laptop.example", "allowSameAddress": True}, "Troy Goode <troy@laptop.example>\nPerson One <one@x.example>\n")
    assert not ok and "Person One <one@x.example>" in reason, reason
    assert not mailmap("Troy Goode <troy@laptop.example>\nDouglas Wilson <fiona@formatter.example>\n", allow=True), "a single bracket address with no Troy name fails with the flag"
    assert not mailmap("Troy Goode <troy@laptop.example>\nPerson One\n", allow=True), "a line with no address and no Troy name fails"

    # Majority of three votes: two of three passes. Two valid votes must agree. One valid vote is an error.
    assert majority([True, True, False]) is True
    assert majority([True, False, True]) is True
    assert majority([False, True, False]) is False
    assert majority([False, False, True]) is False
    assert majority([True, True, None]) is True
    assert majority([True, False, None]) is False
    assert majority([True, None, None]) is None
    assert majority([None, None, None]) is None

    def reply(*pairs):
        return json.dumps({"A": [{"n": n, "pass": p, "reason": "r"} for n, p in pairs]})

    # A call that does not parse, or failed, is a missing vote for every criterion of that call.
    votes, _ = vote_matrix([reply((2, True), (3, False)), "not json", reply((2, False))], [2, 3], ["A"])
    assert votes["A"][2] == [True, None, False], votes
    assert votes["A"][3] == [False, None, None], votes
    votes, _ = vote_matrix([reply((2, True)), None, "junk"], [2], ["A"])
    assert votes["A"][2] == [True, None, None] and majority(votes["A"][2]) is None

    parsed = parse_grade({"A": [{"n": 2, "pass": True, "reason": "a"}], "B": []}, [2, 3], ["A", "B"])
    assert parsed["A"][2]["pass"] is True and parsed["A"][3]["pass"] is None
    assert parsed["A"][3]["reason"] == "no verdict in reply"
    for bad, ns, labs in (({"A": [{"n": 1, "pass": "yes"}]}, [1], ["A"]), ({"A": []}, [1], ["A", "B"])):
        try:
            parse_grade(bad, ns, labs)
            raise AssertionError("expected ValueError for %r" % (bad,))
        except ValueError:
            pass

    # The grader sees only the criteria that have no script check, under their own numbers.
    task = {"id": "T9", "prompt": "p", "criteria": ["first", "second", "third"], "checks": [None, {"type": "regex_all", "patterns": ["x"]}, None]}
    prompt = blind_prompt(task, "truth", {"A": ("answer", None)}, [1, 3])
    assert "\n1. first\n" in prompt and "\n3. third\n" in prompt and "second" not in prompt, prompt
    assert script_verdicts(task["checks"], "x here", None) == {2: (True, "script: all patterns found")}

    # Agreement: model pairs 3 (one unanimous; the errored criterion 2 of run 2 is left out), script pairs 2.
    tasks = [{"id": "T1", "criteria": ["a", "b", "c"], "checks": [None, None, {"type": "regex_all", "patterns": ["x"]}]}]
    scores = {"T1": {"ours": {
        "1": {"criteria": [
            {"n": 1, "pass": True, "method": "model", "votes": [True, True, True], "kind": "outcome"},
            {"n": 2, "pass": True, "method": "model", "votes": [True, False, True], "kind": "outcome"},
            {"n": 3, "pass": True, "method": "script", "votes": None, "kind": "outcome"}]},
        "2": {"criteria": [
            {"n": 1, "pass": False, "method": "model", "votes": [False, False, None], "kind": "outcome"},
            {"n": 2, "pass": None, "method": "model", "votes": [None, None, True], "error": "fewer than 2 votes", "kind": "outcome"},
            {"n": 3, "pass": False, "method": "script", "votes": None, "kind": "outcome"}]},
    }}}
    agree = compute_agreement(scores, tasks)
    assert agree["T1"]["script_criteria"] == 1 and agree["T1"]["model_criteria"] == 2
    assert agree["T1"]["model_pairs"] == 3 and agree["T1"]["unanimous"] == 1 and agree["T1"]["script_pairs"] == 2
    assert agree["overall"]["model_pairs"] == 3 and agree["overall"]["unanimous"] == 1
    assert abs(agree["overall"]["unanimous_share"] - 1 / 3) < 1e-9
    assert abs(agree["overall"]["script_share"] - 2 / 5) < 1e-9

    # A criterion with an error is left out of the pass count and of the possible count.
    assert pass_count({"criteria": scores["T1"]["ours"]["2"]["criteria"]}) == 0
    assert possible({"criteria": scores["T1"]["ours"]["2"]["criteria"]}) == 2

    # The per-run marks: E for an error, * for a model verdict whose votes were not unanimous.
    assert mark({"pass": None, "error": "fewer than two valid votes"}) == "E"
    assert mark({"pass": True, "method": "model", "votes": [True, True, True], "error": None}) == "1"
    assert mark({"pass": True, "method": "model", "votes": [True, False, True], "error": None}) == "1*"
    assert mark({"pass": False, "method": "script", "votes": None, "error": None}) == "0"


def main(argv):
    if "--help" in argv or "-h" in argv:
        print(__doc__.strip())
        return 0
    if "--self-test" in argv:
        return self_test()
    args = [a for a in argv[1:]]
    max_run = None
    if "--arms" in args:
        i = args.index("--arms")
        if i + 1 >= len(args) or not set(args[i + 1].split(",")) <= set(ARMS):
            print("usage: grade.py <out-dir> [--arms ours,...]", file=sys.stderr)
            return 2
        ONLY_ARMS[:] = args[i + 1].split(",")
        del args[i:i + 2]
    if "--runs" in args:
        i = args.index("--runs")
        if i + 1 >= len(args) or not args[i + 1].isdigit():
            print("usage: grade.py <out-dir> [--runs N]", file=sys.stderr)
            return 2
        max_run = int(args[i + 1])
        del args[i:i + 2]
    if len(args) != 1:
        print("usage: grade.py <out-dir> [--runs N] | --self-test", file=sys.stderr)
        return 2
    return grade_all(os.path.abspath(args[0]), max_run)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
