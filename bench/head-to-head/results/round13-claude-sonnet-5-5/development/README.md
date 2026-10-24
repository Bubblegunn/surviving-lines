# Development gates of round 13 (not part of the claim)

Two development gates decided whether a final measurement was started (ruling R13-5, restated in each protocol). They are published for completeness; transcripts are not included (size). Each folder has the task file as run (`gate-tasks.json`), the analysis output (`ANALYSIS.txt`, produced by `analyse.py`), the grades (`scores.json`), a per-task table (`per-task.md`) and the driver log.

| Gate | protocol commit | result commit | product | cells |
| --- | --- | --- | --- | --- |
| 1 | `8f47718` (2026-10-24T05:01:02+03:00) | `779b201` (2026-10-24T07:28:22+03:00) | `6fa5c6d` | 396 new cells |
| 2 | `779b201` (2026-10-24T07:28:22+03:00) | `8345b3d` (2026-10-24T07:53:10+03:00) | `8af57f4` | 66 new `ours` cells; 330 rival cells reused from gate 1 (same day, fixtures, path and rival copies); every unit graded again |

Gate 1 gave no clear lead; the diagnosis (Stop hook blocking the first answer in 30 of 66 `ours` cells, machine-written files without a banner, a skill rule that contradicted the writers' convention) is in `docs/HEAD-TO-HEAD.md` at the result commit. The product of gate 2 is the product of the final measurement.
Dev sets a, b and c (tasks DA*, DB*, DC*) were written by three fresh Sonnet agents (prompts in `writers/`), stored on the local branch `devgate-2026-10-r13` at `8b450eb`; the controller read none of their content. HE* and HF* are the seen held-out sets e and f (rounds 9 to 12). The diagnosis and sweep documents are in `docs/`: `BEST-RIVAL-r13.md`, `BEST-RIVAL-r13-deep.md`, `SWEEP-2026-10-23.md`, `RESEARCH-DEEP-2026-10-22.md`.
