# Does commit share predict surviving-line share?

A first measurement, run 5 September 2026. The design was written before the run, in
[`docs/superpowers/specs/2026-09-05-surviving-lines-divergence-design.md`](../docs/superpowers/specs/2026-09-05-surviving-lines-divergence-design.md),
including what a null result would mean, so the conclusion could not drift with the data.

## Why it is worth measuring

Line survival is well studied. Spinellis, Louridas and Kechagia tracked 3.3 billion lifetime
events across 89 repositories and found a median line lifespan of about 2.4 years
([PeerJ CS 7:e372, 2021](https://doi.org/10.7717/peerj-cs.372); their code is archived at
[doi 10.5281/zenodo.4319993](https://doi.org/10.5281/zenodo.4319993), CC-BY-4.0). Gurov
modelled 32.5 million line births in 120 TypeScript repositories with Cox proportional
hazards and found over half of all lines are never deleted
([arXiv 2606.04993, 2026](https://arxiv.org/abs/2606.04993)), describing the framework as
one that "treats each line as a right-censored subject".

Both measure lines. Neither measures people. This measures people.

## Method

Twelve repositories drawn from GitHub search by language, star band, size and recent
activity, excluding forks and archived repositories. For each: clone, measure every author's
non-merge commit share and their share of surviving lines at HEAD over a 1-in-5 deterministic
file sample, delete. Three seeds per repository, so seed sensitivity is reported rather than
assumed away. 36 runs, 2,748 author rows, in
[`divergence-2026-09-05.tsv`](divergence-2026-09-05.tsv); the list is
[`repos-2026-09-05.txt`](repos-2026-09-05.txt) and the harness is
[`scripts/divergence.mjs`](../scripts/divergence.mjs).

## Result

**They usually agree on who is first, and often disagree on by how much.**

The person with the most commits was also the person with the most surviving lines in
**25 of 36 runs**, and in 9 of the 12 repositories on every seed. So the headline that commit
counts are worthless is not what this found, and is not claimed.

Among authors holding at least 5% of either measure, the absolute gap between the two shares
had a **median of 7.5 and a mean of 12.2 percentage points**, and **35% of them differed by
10 points or more**. The largest single gap was 63.8 points.

| repository | authors | files sampled | top by commits | its line share | top by lines | its commit share | same person |
|---|---:|---|---|---:|---|---:|---|
| Micro-sheep/efinance | 4 | 11/11/5 of 45 | sheep (90%) | 91-97% | sheep | 90% | yes |
| boppreh/keyboard | 42 | 10/11/5 of 34 | BoppreH (87%) | 89-95% | BoppreH | 87% | yes |
| cloudflare/capnweb | 34 | 70/56/67 of 321 | Kenton Varda (46%) | 3-16% | Dimitri Mitropoulos | 2% | no |
| hunvreus/pagescms | 8 | 67/57/52 of 278 | Ronan Berder (96%) | 100% | Ronan Berder | 96% | yes |
| kashav/fsql | 8 | 16/15/11 of 59 | Kashav Madan (94%) | 97-100% | Kashav Madan | 94% | yes |
| kkdai/youtube | 69 | 11/9/9 of 56 | Julian Kornberger (34%) | 49-59% | Julian Kornberger | 34% | yes |
| lektor/lektor | 110 | 95/104/111 of 474 | Jeff Dairiki (29%) | 46-50% | Jeff Dairiki | 29% | yes |
| linkedin/Burrow | 127 | 22/17/23 of 91 | Vlad Gorodetsky (18%) | 4-8% | Todd Palino | 11% | no |
| lukeautry/tsoa | 232 | 54/67/60 of 290 | Luke Autry (20%) | 5-13% | WoH | 16-20% | varies by seed |
| mcuadros/ofelia | 43 | 15/16/11 of 51 | github-actions[bot] (29%) | 0-1% | Taras | 10-20% | no |
| rust-postgres/rust-postgres | 187 | 43/31/42 of 182 | Steven Fackler (79%) | 53-70% | Steven Fackler | 79% | yes |
| willnorris/imageproxy | 52 | 14/14/2 of 45 | Will Norris (79%) | 82-83% | Will Norris | 79% | yes |

## What this cannot support

**The sample is twelve repositories.** It describes those twelve. It is not a statement about
open source, and the harness exists so the sample can grow.

**The magnitude of any single number moves with the seed.** Across three seeds the top
survivor's share had a median spread of 5.4 and a maximum of 17.4 percentage points. In
`cloudflare/capnweb` one author's line share reads 3%, 6% or 16% depending on the seed. At
1-in-5 on a few dozen files that is expected, and it is the reason the sample parameters are
printed on every run. Read a direction from one run; read a magnitude from several, or raise
the sample.

**One repository's top committer is a bot.** In `mcuadros/ofelia`, `github-actions[bot]` holds
29% of commits and about 1% of surviving lines. This tool does not exclude bots, and that is
a limitation rather than a result; workproof does exclude them, and this measurement is an
argument for bringing that here.

**Survivorship is not merit.** Code can survive because it is good, because nobody dares
touch it, or because nobody reads it. Nothing here separates those.
