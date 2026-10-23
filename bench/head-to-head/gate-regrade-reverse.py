#!/usr/bin/env python3
"""Second grading for criteria that stayed unparsed after the re-asks of gate-grade.py (round 11 protocol).

Usage: python3 -I gate-regrade-reverse.py <out> <tasks-file> <truth-dir> [--hide DIR]...

For every cell of <out>/grade/scores.json that has a criterion with fewer than two valid votes
(`pass` is null), the same answers are shown again with the labels assigned in the reverse of the
first shuffled order, three new `claude -p` calls (same grader, same prompt text). Only the null
criteria take the votes of this second grading (`via` = "reverse", `reverse_votes` keeps them);
a criterion with a valid majority is never changed. A criterion that is still null stays `err`.
Writes <out>/grade/<task>-<n>.rev.in, .rev.callK.out, .rev.labels.json and updates scores.json.
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("gate_grade", os.path.join(HERE, "gate-grade.py"))
gg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gg)
g = gg.g


def main(argv):
    out, tasks_file, truth_dir = os.path.abspath(argv[1]), argv[2], argv[3]
    hide = [argv[i + 1] for i, a in enumerate(argv) if a == "--hide"]
    tasks = {t["id"]: t for t in json.load(open(tasks_file, encoding="utf-8"))["tasks"]}
    grade_dir = os.path.join(out, "grade")
    path = os.path.join(grade_dir, "scores.json")
    scores = json.load(open(path))
    cells = {}
    for tid, arms in scores.items():
        for arm, runs in arms.items():
            for n, rec in runs.items():
                if any(c["pass"] is None for c in rec["criteria"]):
                    cells.setdefault((tid, int(n)), []).append(arm)
    for (tid, n), bad_arms in sorted(cells.items()):
        task = tasks[tid]
        truth = open(os.path.join(truth_dir, task["fixture"] + ".txt"), encoding="utf-8").read()
        kinds = task.get("criteriaKinds")
        numbers = [i + 1 for i in range(len(task["criteria"])) if not kinds or kinds[i] == "outcome"]
        key = "%s-%d" % (tid, n)
        first = json.load(open(os.path.join(grade_dir, key + ".labels.json")))
        order = [first[lab] for lab in sorted(first)]
        reverse = list(reversed(order))
        mapping = {"ABCDEF"[i]: arm for i, arm in enumerate(reverse)}
        json.dump(mapping, open(os.path.join(grade_dir, key + ".rev.labels.json"), "w"), indent=1)
        blind = {}
        for lab, arm in mapping.items():
            run = os.path.join(out, "runs", "%s-%s-%d" % (tid, arm, n))
            text = open(os.path.join(run, "final.txt"), encoding="utf-8", errors="replace").read()
            mp = os.path.join(run, "mailmap.txt")
            mm = open(mp, encoding="utf-8", errors="replace").read() if os.path.exists(mp) else None
            blind[lab] = (gg.hide_more(g.blind_text(text, [d for d in hide if d])), mm)
        prompt = g.blind_prompt(task, truth, blind, numbers)
        with open(os.path.join(grade_dir, key + ".rev.in"), "w", encoding="utf-8") as fh:
            fh.write(prompt)
        votes, _reasons, problems = g.grade_votes(prompt, grade_dir, os.path.join(grade_dir, key + ".rev"), numbers, sorted(mapping))
        print("%s reverse: %s" % (key, "graded" if not problems else "; ".join(problems)), flush=True)
        for lab, arm in mapping.items():
            rec = scores[tid][arm][str(n)]
            for c in rec["criteria"]:
                if c["pass"] is None:
                    v = votes[lab][c["n"]]
                    c["reverse_votes"] = v
                    c["pass"] = gg.majority(v)
                    c["via"] = "reverse"
    json.dump(scores, open(path, "w"), indent=1)
    gg.write_results(out, list(tasks.values()), scores)


if __name__ == "__main__":
    main(sys.argv)
