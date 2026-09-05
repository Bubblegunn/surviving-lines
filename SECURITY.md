# Security

Report a vulnerability privately through GitHub's security advisories:
https://github.com/Bubblegunn/surviving-lines/security/advisories/new

Do not open a public issue for a security problem. You will get a first response within
72 hours, and a fix or a written assessment within 14 days of confirmation.

## Supported versions

Only the latest minor release receives security fixes. Upgrade before reporting if you are
behind; if the problem reproduces on the latest release, report it.

## Scope

The CLI reads git history and prints a table. In scope: anything that executes untrusted input, or misattributes lines in a way an attacker could steer through repository contents.
