# Published form of the sealed set z scripts

The files in this folder are the published form of the five task scripts of SEALED z. Every
literal e-mail address of a real contributor was replaced by its SHA-256 (address trimmed and
lower-cased). `build-fixture.sh` looks the real address up in the pinned upstream clone by that hash;
`truth.py` hashes the addresses it reads from the freshly built fixture and compares hashes. No real
address is written in any file. Synthetic addresses on `.local` and `example` domains are kept, and a
synthetic GitHub no-reply address for a made-up login is assembled at run time by `nr()`.
The originals stay on the local branch `heldout-2026-10-z` (not published).
This changes only the published form of the evidence, not anything that was run or graded.

Verification (2026-10-24, fresh builds from the published scripts): for z1 to z5 the fixture HEAD
equals the HEAD that was run and graded (z1 475b3d4, z2 08af9ee, z3 bd73202, z4 0217c80, z5 b607d90),
and `python3 -I truth.py <fixture>` reproduces the committed `truth.txt` byte for byte, which is also
byte-identical to the original `truth.txt`.
Command: `bash zN/build-fixture.sh <dir> && python3 -I zN/truth.py <dir> | cmp - zN/truth.txt`.
Needs network access to clone the pinned upstream repositories.
