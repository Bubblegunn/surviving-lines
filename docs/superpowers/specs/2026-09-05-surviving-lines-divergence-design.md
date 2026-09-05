# surviving-lines: does commit share predict surviving-line share?

Written 2026-09-05, before the measurement, so the conclusion cannot drift with the data.

## The gap

Line survival is well studied. Spinellis, Louridas and Kechagia tracked 3.3 billion
lifetime events across 89 repositories and found a median line lifespan of about 2.4
years, with young lines the most likely to die (*Software evolution: the lifetime of
fine-grained elements*, PeerJ Computer Science 7:e372, 2021, doi 10.7717/peerj-cs.372;
their code is archived at doi 10.5281/zenodo.4319993, CC-BY-4.0). Gurov modelled 32.5
million line births in 120 TypeScript repositories with Cox proportional hazards and
found over half of all lines are never deleted (*Code Lifespan Survival Analysis*, arXiv
2606.04993, 2026), stating that the framework "treats each line as a right-censored
subject".

Both measure **lines**. Neither measures **people**. Whether an author's share of commits
predicts their share of the code still alive is, as far as this search found, unpublished.
This tool computes both numbers side by side, which makes the question cheap for the
first time.

## The measurement

For each sampled repository, at HEAD: every author's share of non-merge commits, and
their share of surviving lines over a deterministic file sample, identities merged
through `.mailmap`. The quantity of interest is the gap between the two, per author and
per repository.

Sampling is deterministic and seeded, so the run is reproducible; several seeds are used
so that seed sensitivity is reported rather than assumed away.

## Selection, and the traps in it

Repositories are drawn from public activity data, not measured from it: `git blame` needs
real objects, so an event corpus can choose the sample and nothing more. Kalliamvakou and
colleagues' cautions apply and are applied: personal and inactive repositories are
excluded, because most repositories on a forge are both.

The pipeline is clone, measure, delete, stream, so disk is bounded and the sample can
grow later without redesign.

## What each outcome means, decided in advance

**A large, structured gap** would mean commit counts are a poor proxy for what remains,
and would say what predicts the difference.

**Agreement within noise is a real result and will be published as one.** It would mean
commit counts are a fine proxy, that the dashboards everyone already has are not lying,
and that part of this tool's own pitch is wrong. Writing that sentence before the run is
the point of writing the spec first.

Either way the per-repository table ships in the repository, so a stranger can disagree
with the analysis without rerunning the measurement.

## Limits

A sample of this size describes the sample. It does not describe open source. Survivorship
is not merit: code can survive because nobody dares touch it. The tool's own output says
so on every run, and the study does not get to forget it.
