#!/usr/bin/env python3
"""Final-gate grading: every arm of one task and run is graded together, in a shuffled order.

Usage: python3 -I gate-grade.py <out> <tasks-file> <truth-dir> [--hide DIR]... [--cells task-n,...]

<out>/runs/<task>-<arm>-<n>/final.txt are the answers. <truth-dir>/<fixture>.txt is the ground truth of a
fixture. Same method as grade.py: the answers of all arms of a cell are labelled in a shuffled order, header
lines are removed and plugin names and directories in the command lines are replaced, a separate `claude -p`
call marks each criterion, three calls per cell, a criterion keeps the majority of the valid votes (two of
three). Every criterion of the held-out tasks is judged by the model (no script checks). Writes
<out>/grade/<task>-<n>.in, .callK.out, .labels.json, scores.json and RESULTS.md.
"""
import json
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grade as g  # noqa: E402

ARMS = ["ours", "pp", "ppi", "hist", "bf", "base"]


def hide_more(text):
    head, sep, answer = text.partition("\nFINAL ANSWER:")
    head = re.sub(r"mcp__[\w-]+__", "mcp__tool__", head)
    head = re.sub(r"(?<![\w-])(?:busfactor|git-historian|ownership\.mjs)(?![\w-])", "<plugin>", head)
    return head + sep + answer


def majority(votes):
    valid = [v for v in votes if v is not None]
    if len(valid) < 2:
        return None
    return sum(valid) * 2 > len(valid) if len(valid) == 3 else (valid[0] if valid[0] == valid[1] else None)


def main(argv):
    out, tasks_file, truth_dir = os.path.abspath(argv[1]), argv[2], argv[3]
    hide = [argv[i + 1] for i, a in enumerate(argv) if a == "--hide"]
    only = None
    if "--cells" in argv:
        only = set(argv[argv.index("--cells") + 1].split(","))
    tasks = json.load(open(tasks_file, encoding="utf-8"))["tasks"]
    grade_dir = os.path.join(out, "grade")
    os.makedirs(grade_dir, exist_ok=True)
    plugin_dirs = [d for d in hide if d]
    scores = {}
    for task in tasks:
        tid = task["id"]
        truth = open(os.path.join(truth_dir, task["fixture"] + ".txt"), encoding="utf-8").read()
        kinds = task.get("criteriaKinds")
        numbers = [i + 1 for i in range(len(task["criteria"])) if not kinds or kinds[i] == "outcome"]
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
            mapping = {"ABCDEF"[i]: arm for i, arm in enumerate(shuffled)}
            with open(os.path.join(grade_dir, key + ".labels.json"), "w") as fh:
                json.dump(mapping, fh, indent=1)
            blind = {lab: (hide_more(g.blind_text(finals[arm], plugin_dirs)), mailmaps[arm]) for lab, arm in mapping.items()}
            prompt = g.blind_prompt(task, truth, blind, numbers)
            with open(os.path.join(grade_dir, key + ".in"), "w", encoding="utf-8") as fh:
                fh.write(prompt)
            votes, reasons, problems = g.grade_votes(prompt, grade_dir, os.path.join(grade_dir, key), numbers, sorted(mapping))
            print("%s: %s" % (key, "graded" if not problems else "; ".join(problems)), flush=True)
            for lab, arm in mapping.items():
                crit = []
                for k in numbers:
                    v = votes[lab][k]
                    crit.append({"n": k, "votes": v, "pass": majority(v)})
                scores.setdefault(tid, {}).setdefault(arm, {})[n] = {"criteria": crit, "problems": problems}
    path = os.path.join(grade_dir, "scores.json")
    old = json.load(open(path)) if os.path.exists(path) else {}
    for tid, arms in scores.items():
        for arm, runs in arms.items():
            for n, rec in runs.items():
                old.setdefault(tid, {}).setdefault(arm, {})[str(n)] = rec
    json.dump(old, open(path, "w"), indent=1)
    write_results(out, tasks, old)


def cell_score(rec):
    c = rec["criteria"]
    return sum(1 for x in c if x["pass"]), sum(1 for x in c if x["pass"] is None)


def n_outcome(t):
    kinds = t.get("criteriaKinds")
    return sum(1 for k in kinds if k == "outcome") if kinds else len(t["criteria"])


def write_results(out, tasks, scores):
    lines = ["# Final gate results (outcome criteria, all arms graded together)", ""]
    arms = [a for a in ARMS if any(a in scores.get(t["id"], {}) for t in tasks)]
    lines.append("| Task | Criteria | " + " | ".join(arms) + " |")
    lines.append("| --- | --- | " + " | ".join("---" for _ in arms) + " |")
    totals = {a: 0.0 for a in arms}
    for t in tasks:
        row = []
        for a in arms:
            runs = scores.get(t["id"], {}).get(a, {})
            vals = [cell_score(r)[0] for r in runs.values()]
            errs = sum(cell_score(r)[1] for r in runs.values())
            if vals:
                m = sum(vals) / len(vals)
                totals[a] += m
                row.append("%.2f (%s)%s" % (m, "/".join(str(v) for v in vals), " err=%d" % errs if errs else ""))
            else:
                row.append("-")
        lines.append("| %s | %d | %s |" % (t["id"], n_outcome(t), " | ".join(row)))
    lines.append("| Total | %d | %s |" % (sum(n_outcome(t) for t in tasks), " | ".join("%.2f" % totals[a] for a in arms)))
    open(os.path.join(out, "grade", "RESULTS.md"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main(sys.argv)
