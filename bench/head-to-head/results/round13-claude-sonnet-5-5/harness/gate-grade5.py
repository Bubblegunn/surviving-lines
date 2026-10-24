#!/usr/bin/env python3
"""Final-gate grading with five calls per cell, reason before verdict (round 12 protocol, proposal R10-6).

Usage:
  python3 -I gate-grade5.py <out> <tasks-file> <truth-dir> [--hide DIR]... [--cells task-n,...] [--reverse]
  python3 -I gate-grade5.py --self-test

Same cells, labels, blinding and shuffled order as gate-grade.py (which is unchanged). Differences:
  * FIVE separate `claude -p` calls per cell (gate-grade.py: three).
  * The prompt asks for each entry as {"n", "reason", "pass"} and says to write the reason first, so the
    verdict is written after the reasoning. Key order is not enforced by the parser; `reason_first(raw)`
    reports whether a reply followed it, and score.py reports the share.
  * A criterion takes the majority of its VALID votes: pass when more than half of the valid votes are
    true (a tie of 2-2 among four valid votes fails). A criterion with fewer than three valid votes
    (MIN_VALID) is `err` (pass None). A call that fails or does not parse gives no vote on any criterion.
  * Re-ask passes: running the script again on the same cell asks again only the calls whose reply on disk
    does not parse (the driver runs at most three further passes). Cached valid replies are kept.
  * `--reverse`: for cells that still have an `err` criterion, the same answers are shown with the labels
    assigned in the reverse of the first shuffled order, five new calls; their votes replace only the `err`
    criteria (`via` = "reverse", `reverse_votes` keeps them). A criterion still `err` stays `err`.
Writes <out>/grade/<task>-<n>.in, .callK.out (K = 1..5), .labels.json, scores.json and RESULTS.md. scores.json
is updated under a file lock, so several cells may be graded at the same time.
"""
import fcntl
import importlib.util
import json
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_spec = importlib.util.spec_from_file_location("gate_grade", os.path.join(HERE, "gate-grade.py"))
gg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gg)
g = gg.g

VOTES = 5
MIN_VALID = 3
g.VOTES = VOTES  # grade_votes asks this many calls
ARMS = gg.ARMS


def majority(votes):
    """True or False by the majority of the valid votes; None (err) when fewer than MIN_VALID are valid.
    More than half of the valid votes must be true to pass, so a 2-2 tie fails."""
    valid = [v for v in votes if v is not None]
    if len(valid) < MIN_VALID:
        return None
    return sum(1 for v in valid if v) * 2 > len(valid)


def blind_prompt(task, truth, answers, numbers):
    """gate-grade.py's prompt with the reply format changed: reason first, then pass."""
    labels = sorted(answers)
    lines = [
        "You grade %d answers to one task about a git repository." % len(labels),
        "For each criterion listed and each answer, decide pass (true) or fail (false).",
        "For every entry write the reason FIRST (one to three sentences: what the answer says, what the ground truth and the criterion require, and where they differ or agree), then give the verdict in the field pass. Decide the verdict only after writing the reason.",
        "Use the ground truth for every number. A criterion that asks for a hedge passes only when the answer hedges.",
        'Reply with ONLY a JSON object: {%s}' % ", ".join('"%s": [{"n": %d, "reason": "...", "pass": true}]' % (lab, numbers[0]) for lab in labels),
        "with one entry per listed criterion, using its number n (%s); in each entry the key reason comes before the key pass." % ", ".join(str(n) for n in numbers),
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


def reason_first(raw):
    """True when every entry of the reply writes the key reason before the key pass; None when the reply does not parse."""
    try:
        obj = json.loads(g.reply_text(raw)[g.reply_text(raw).find("{"):g.reply_text(raw).rfind("}") + 1],
                         object_pairs_hook=lambda pairs: pairs)
    except (ValueError, TypeError):
        return None
    ok = True
    for _label, entries in obj:
        if not isinstance(entries, list):
            return None
        for entry in entries:
            keys = [k for k, _ in entry] if isinstance(entry, list) else []
            if "reason" not in keys or "pass" not in keys or keys.index("reason") > keys.index("pass"):
                ok = False
    return ok


class Locked:
    def __init__(self, grade_dir):
        self.path = os.path.join(grade_dir, ".scores.lock")

    def __enter__(self):
        self.fh = open(self.path, "w")
        fcntl.flock(self.fh, fcntl.LOCK_EX)

    def __exit__(self, *exc):
        fcntl.flock(self.fh, fcntl.LOCK_UN)
        self.fh.close()


def task_numbers(task):
    kinds = task.get("criteriaKinds")
    return [i + 1 for i in range(len(task["criteria"])) if not kinds or kinds[i] == "outcome"]


def merge_scores(grade_dir, tasks, new):
    path = os.path.join(grade_dir, "scores.json")
    with Locked(grade_dir):
        old = json.load(open(path)) if os.path.exists(path) else {}
        for tid, arms in new.items():
            for arm, runs in arms.items():
                for n, rec in runs.items():
                    old.setdefault(tid, {}).setdefault(arm, {})[str(n)] = rec
        json.dump(old, open(path, "w"), indent=1)
        gg.write_results(os.path.dirname(grade_dir), tasks, old)
    return old


def main(argv):
    out, tasks_file, truth_dir = os.path.abspath(argv[1]), argv[2], argv[3]
    hide = [argv[i + 1] for i, a in enumerate(argv) if a == "--hide"]
    only = set(argv[argv.index("--cells") + 1].split(",")) if "--cells" in argv else None
    reverse = "--reverse" in argv
    task_list = json.load(open(tasks_file, encoding="utf-8"))["tasks"]
    grade_dir = os.path.join(out, "grade")
    os.makedirs(grade_dir, exist_ok=True)
    plugin_dirs = [d for d in hide if d]
    existing = json.load(open(os.path.join(grade_dir, "scores.json"))) if reverse else {}
    new = {}
    for task in task_list:
        tid = task["id"]
        truth = open(os.path.join(truth_dir, task["fixture"] + ".txt"), encoding="utf-8").read()
        numbers = task_numbers(task)
        runs = sorted({int(m.group(1)) for d in os.listdir(os.path.join(out, "runs"))
                       for m in [re.fullmatch(re.escape(tid) + r"-\w+-(\d+)", d)] if m})
        for n in runs:
            key = "%s-%d" % (tid, n)
            if only is not None and key not in only:
                continue
            finals, mailmaps = {}, {}
            for arm in ARMS:
                p = os.path.join(out, "runs", "%s-%s-%d" % (tid, arm, n), "final.txt")
                if os.path.exists(p):
                    finals[arm] = open(p, encoding="utf-8", errors="replace").read()
                    mp = os.path.join(out, "runs", "%s-%s-%d" % (tid, arm, n), "mailmap.txt")
                    mailmaps[arm] = open(mp, encoding="utf-8", errors="replace").read() if os.path.exists(mp) else None
            arms = [a for a in ARMS if a in finals]
            shuffled = list(arms)
            random.Random("%s-%d-gate" % (tid, n)).shuffle(shuffled)
            if reverse:
                bad = [a for a in arms if any(c["pass"] is None for c in existing.get(tid, {}).get(a, {}).get(str(n), {"criteria": []})["criteria"])]
                if not bad:
                    continue
                shuffled = list(reversed(shuffled))
                suffix = ".rev"
            else:
                suffix = ""
            mapping = {"ABCDEF"[i]: arm for i, arm in enumerate(shuffled)}
            with open(os.path.join(grade_dir, key + suffix + ".labels.json"), "w") as fh:
                json.dump(mapping, fh, indent=1)
            blind = {lab: (gg.hide_more(g.blind_text(finals[arm], plugin_dirs)), mailmaps[arm]) for lab, arm in mapping.items()}
            prompt = blind_prompt(task, truth, blind, numbers)
            with open(os.path.join(grade_dir, key + suffix + ".in"), "w", encoding="utf-8") as fh:
                fh.write(prompt)
            votes, _reasons, problems = g.grade_votes(prompt, grade_dir, os.path.join(grade_dir, key + suffix), numbers, sorted(mapping))
            print("%s%s: %s" % (key, " reverse" if reverse else "", "graded" if not problems else "; ".join(problems)), flush=True)
            for lab, arm in mapping.items():
                if reverse:
                    rec = existing[tid][arm][str(n)]
                    for c in rec["criteria"]:
                        if c["pass"] is None:
                            c["reverse_votes"] = votes[lab][c["n"]]
                            c["pass"] = majority(votes[lab][c["n"]])
                            c["via"] = "reverse"
                    new.setdefault(tid, {}).setdefault(arm, {})[n] = rec
                else:
                    crit = [{"n": k, "votes": votes[lab][k], "pass": majority(votes[lab][k])} for k in numbers]
                    new.setdefault(tid, {}).setdefault(arm, {})[n] = {"criteria": crit, "problems": problems}
    if new:
        merge_scores(grade_dir, task_list, new)


# ---- self-test (no model call) ----------------------------------------------

def _reply(label_entries, order="rp"):
    """A canned grader reply: {label: [(n, reason, pass)]} in the given key order."""
    obj = {}
    for lab, entries in label_entries.items():
        obj[lab] = [({"n": n, "reason": r, "pass": p} if order == "rp" else {"n": n, "pass": p, "reason": r}) for n, r, p in entries]
    return json.dumps({"result": "```json\n" + json.dumps(obj) + "\n```"})


def self_test():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    # majority: strict majority of valid votes, fewer than three valid votes is err
    check("5 votes 3-2 pass", majority([True, True, True, False, False]) is True)
    check("5 votes 2-3 fail", majority([True, True, False, False, False]) is False)
    check("4 valid 2-2 fails", majority([True, True, False, False, None]) is False)
    check("4 valid 3-1 passes", majority([True, True, True, False, None]) is True)
    check("3 valid 2-1 passes", majority([True, True, False, None, None]) is True)
    check("3 valid 1-2 fails", majority([True, False, False, None, None]) is False)
    check("2 valid is err", majority([True, True, None, None, None]) is None)
    check("0 valid is err", majority([None] * 5) is None)
    check("3 valid unanimous false", majority([False, False, False, None, None]) is False)
    # prompt: reason before pass, five-call wording
    task = {"prompt": "who owns it?", "criteria": ["c one", "c two"]}
    p = blind_prompt(task, "TRUTH", {"A": ("answer a", None), "B": ("answer b", "mm")}, [1, 2])
    check("prompt example reason first", p.index('"reason": "..."') < p.index('"pass": true'))
    check("prompt tells reason first", "the reason FIRST" in p)
    check("prompt has mailmap", "FILE .mailmap" in p and "=== ANSWER B ===" in p)
    # parsing: reason-first reply, pass-first reply, bad replies
    good = _reply({"A": [(1, "ok", True), (2, "no", False)]})
    check("parses fenced reply", g.reply_parses(good, [1, 2], ["A"]))
    check("reason_first true", reason_first(good) is True)
    check("reason_first false", reason_first(_reply({"A": [(1, "ok", True), (2, "no", False)]}, order="pr")) is False)
    check("reason_first none on junk", reason_first("not json") is None)
    check("junk does not parse", not g.reply_parses("not json", [1, 2], ["A"]))
    check("missing label does not parse", not g.reply_parses(good, [1, 2], ["A", "B"]))
    check("non-bool pass does not parse", not g.reply_parses(json.dumps({"result": '{"A":[{"n":1,"reason":"x","pass":"yes"}]}'}), [1], ["A"]))
    votes, reasons = g.vote_matrix([good, good, "junk", good, None], [1, 2], ["A"])
    check("vote matrix keeps position", votes["A"][1] == [True, True, None, True, None] and votes["A"][2] == [False, False, None, False, None])
    check("reasons kept", reasons["A"][1][0] == "ok")
    check("five votes constant", VOTES == 5 and g.VOTES == 5 and MIN_VALID == 3)
    check("cell with 2 valid calls is err", majority(votes["A"][1][:3] + [None, None]) is None and majority(votes["A"][1]) is True)
    return failures


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        bad = self_test()
        if bad:
            print("FAIL: " + "; ".join(bad))
            sys.exit(1)
        print("gate-grade5 self-test: all checks passed")
    else:
        main(sys.argv)
