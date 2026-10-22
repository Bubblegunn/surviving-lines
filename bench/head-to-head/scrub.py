#!/usr/bin/env python3
"""Redacts e-mail addresses and local paths from a published head-to-head copy.

Usage:
  python3 -I scrub.py <dir>            redact every text file in place, then fail if one remains
  python3 -I scrub.py --check <dir>    fail if any address remains, change nothing
  python3 -I scrub.py --self-test

An address is kept only when its domain ends with ".example" or when it is
noreply@anthropic.com. Every other address becomes "<email redacted>". The
transcripts quote upstream history, which holds real contributor addresses,
so the published copy must not keep any of them. The home directory ($HOME and
any /Users/<name> prefix), the session scratch prefix (/private/tmp/claude-N/.../scratchpad)
and /var/folders temp prefixes become <home>, <scratch> and <tmp>. The check never prints an
address or a path, only the file path and the number of matches.

A line of a JSON file (run.jsonl is one JSON object per line) is decoded
before it is searched, so an address that follows a JSON escape such as \n is
found as a plain address. The line is then written back with json.dumps, so it
still parses. A line that is not JSON is searched as plain text.
"""
import gzip
import json
import os
import re
import sys

ADDRESS = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
KEEP_EXACT = {"noreply@anthropic.com"}
REDACTED = "<email redacted>"


# Local paths. The scratch prefix goes first because it sits inside /private/tmp, and the home directory
# ($HOME and any /Users/<name> prefix) is replaced after it.
SCRATCH = re.compile(r"/private/tmp/claude-[0-9]+/[^ \"\\]*?/scratchpad")
TMP = re.compile(r"(?:/private)?/var/folders/[^ \"\\]*")
USERS = re.compile(r"/Users/[^/ \"\\]+")


def home_prefixes():
    home = os.environ.get("HOME", "").rstrip("/")
    return [home] if len(home) > 1 else []


# Keys and tokens of the common providers. The pattern list is short on purpose: it covers what a run
# transcript can quote (an environment dump, a config file), and the self-test plants one of each kind.
SECRET = re.compile(
    r"\b(?:sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}"
    r"|tvly-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})"
    r"|(?<=Bearer )[A-Za-z0-9._~+/=-]{20,}"
)
SECRET_PLACEHOLDER = "<secret redacted>"


def redact_paths(text):
    text = SECRET.sub(SECRET_PLACEHOLDER, text)
    text = SCRATCH.sub("<scratch>", text)
    text = TMP.sub("<tmp>", text)
    for home in home_prefixes():
        text = text.replace(home, "<home>")
    return USERS.sub("<home>", text)


def keep(address):
    if address.lower() in KEEP_EXACT:
        return True
    return address.rsplit("@", 1)[1].lower().endswith(".example")


def redact(text):
    return redact_paths(ADDRESS.sub(lambda m: m.group(0) if keep(m.group(0)) else REDACTED, text))


def residual_in(text):
    found = [m.group(0) for m in ADDRESS.finditer(text) if not keep(m.group(0))]
    if redact_paths(text) != text:
        found.append("<local path>")
    return found


def json_value(line):
    """The decoded JSON object or array in a line, or None when the line is not one."""
    if '"' not in line and "{" not in line and "[" not in line:
        return None
    try:
        value = json.loads(line)
    except ValueError:
        return None
    return value if isinstance(value, (dict, list)) else None


def map_strings(value, fn):
    if isinstance(value, str):
        return fn(value)
    if isinstance(value, list):
        return [map_strings(v, fn) for v in value]
    if isinstance(value, dict):
        return {map_strings(k, fn): map_strings(v, fn) for k, v in value.items()}
    return value


def collect_strings(value, out):
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, list):
        for v in value:
            collect_strings(v, out)
    elif isinstance(value, dict):
        for k, v in value.items():
            collect_strings(k, out)
            collect_strings(v, out)
    return out


def scrub_line(line):
    """One line with every redactable address removed. JSON lines stay valid JSON."""
    body = line.rstrip("\r")
    ending = line[len(body):]
    value = json_value(body)
    if value is not None:
        if not any(residual_in(s) for s in collect_strings(value, [])):
            return line
        return json.dumps(map_strings(value, redact), ensure_ascii=False) + ending
    return redact(line)


def scrub_text(text):
    return "\n".join(scrub_line(line) for line in text.split("\n"))


def residual(text):
    """Addresses in the text that the rule would redact, JSON lines decoded first."""
    found = []
    for line in text.split("\n"):
        value = json_value(line.rstrip("\r"))
        if value is None:
            found += residual_in(line)
        else:
            for s in collect_strings(value, []):
                found += residual_in(s)
    return found


def text_files(root):
    """Every file under root without a NUL byte, as a path. Binary files are skipped; .gz files are read by check()."""
    for folder, _, names in os.walk(root):
        for name in names:
            path = os.path.join(folder, name)
            with open(path, "rb") as fh:
                if b"\x00" not in fh.read():
                    yield path


def gz_files(root):
    for folder, _, names in os.walk(root):
        for name in names:
            if name.endswith(".gz"):
                yield os.path.join(folder, name)


def read(path):
    with open(path, encoding="utf-8", errors="surrogateescape") as fh:
        return fh.read()


def write(path, text):
    with open(path, "w", encoding="utf-8", errors="surrogateescape", newline="") as fh:
        fh.write(text)


def check(root):
    """(file, count) for every text file that still holds a redactable address."""
    found = []
    for path in text_files(root):
        count = len(residual(read(path)))
        if count:
            found.append((path, count))
    for path in gz_files(root):
        with gzip.open(path, "rt", encoding="utf-8", errors="surrogateescape") as fh:
            count = len(residual(fh.read()))
        if count:
            found.append((path, count))
    return found


def scrub_tree(root):
    redacted_files = 0
    redacted = 0
    for path in text_files(root):
        text = read(path)
        hits = len(residual(text))
        if hits:
            write(path, scrub_text(text))
            redacted_files += 1
            redacted += hits
    print("redacted %d address(es) in %d file(s)" % (redacted, redacted_files))
    return redacted


def self_test():
    # Planted strings are assembled here, so no address literal sits in the source.
    gmail = "".join(["some", "one", "@", "gm", "ail.com"])
    github = "".join(["12345+name", "@", "users.noreply.github.com"])
    example = "troy@laptop.example"
    anthropic = "noreply@anthropic.com"

    # Plain text: kept and redacted addresses, nothing else touched.
    text = "Author: %s\nAlso %s and %s.\nCo-Authored-By: Claude <%s>\n" % (gmail, github, example, anthropic)
    scrubbed = scrub_text(text)
    assert gmail not in scrubbed, "gmail address survived"
    assert github not in scrubbed, "noreply github address survived"
    assert example in scrubbed, ".example address was redacted"
    assert anthropic in scrubbed, "anthropic noreply address was redacted"
    assert scrubbed.count(REDACTED) == 2, scrubbed
    assert residual(scrubbed) == [], "a redactable address remains after scrubbing"
    assert residual(text) != [], "the planted text should have had redactable addresses"
    # A domain that only contains ".example" is not the same as one that ends with it.
    assert residual("x@mail.example.com") == ["x@mail.example.com"]

    # JSON lines: the address follows an escape in the JSON text (backslash-n, backslash-t).
    # The raw text has the two characters backslash and n before the address, not a newline.
    line = '{"type": "result", "result": "x\\n' + gmail + ' Name\\n\\t' + gmail + '\\r"}'
    before = json.loads(line)
    assert gmail in before["result"]
    scrubbed_line = scrub_text(line + "\n")
    after = json.loads(scrubbed_line.rstrip("\n"))
    assert gmail not in scrubbed_line, "gmail address survived in a JSON line"
    assert after["result"] == "x\n" + REDACTED + " Name\n\t" + REDACTED + "\r", after
    assert residual(scrubbed_line) == []
    # A JSON line with no address is returned byte for byte.
    plain = '{"a": "b\\nc"}\n'
    assert scrub_text(plain) == plain
    # A JSON key that holds an address is redacted too, and the line still parses.
    keyed = json.dumps({gmail: "v"})
    assert json.loads(scrub_text(keyed))[REDACTED] == "v"
    # An address after the escape sequence of an allowed kept address stays.
    kept = '{"r": "x\\n' + anthropic + '"}'
    assert json.loads(scrub_text(kept))["r"] == "x\n" + anthropic
    # Local paths: home, scratch and temp prefixes, in plain text and inside JSON strings.
    os.environ["HOME"] = "/Users/someone"
    scratch = "/private/tmp/claude-501/-Users-someone-Desktop-x/5c2d-ffff/scratchpad"
    samples = [
        "cd /Users/someone/work && ls",
        "cd /Users/other-person/work && ls",
        "ls %s/h2h/fixture" % scratch,
        "ls /var/folders/ab/cd12_x/T/tmp.AbC/repo",
        "ls /private/var/folders/ab/cd12_x/T/tmp.AbC/repo",
    ]
    for sample in samples:
        out = scrub_text(sample)
        for bad in ("someone", "other-person", "claude-501", "var/folders"):
            assert bad not in out, (bad, out)
        assert residual(out) == [], out
        assert residual(sample) != [], sample
    assert scrub_text(samples[2]) == "ls <scratch>/h2h/fixture", scrub_text(samples[2])
    assert scrub_text(samples[0]) == "cd <home>/work && ls"
    assert scrub_text(samples[3]) == "ls <tmp>"
    jline = json.dumps({"cmd": "cd /Users/someone/x\n" + samples[2], "n": 1})
    jout = scrub_text(jline)
    assert json.loads(jout)["cmd"] == "cd <home>/x\nls <scratch>/h2h/fixture", jout
    assert scrub_text("a path /usr/bin/git stays") == "a path /usr/bin/git stays"
    # Keys and tokens: one planted per provider pattern, assembled so no key literal sits in the source.
    keys = ["".join(["sk-", "ant-api03-", "A" * 24]), "".join(["gh", "p_", "B" * 30]), "".join(["npm", "_", "C" * 30]),
            "".join(["tvly", "-", "D" * 20]), "".join(["AK", "IA", "E" * 16]), "".join(["xox", "b-", "1234567890-abc"])]
    for key in keys:
        out = scrub_text("export X=%s\n" % key)
        assert key not in out and SECRET_PLACEHOLDER in out, out
        assert residual("export X=%s" % key) != [], key
    bearer = "Authorization: Bearer " + "F" * 30
    assert "F" * 30 not in scrub_text(bearer) and scrub_text(bearer).startswith("Authorization: Bearer "), scrub_text(bearer)
    assert scrub_text("plain sk-learn and git sha 4b65d05") == "plain sk-learn and git sha 4b65d05"
    # A gzip file is checked by content.
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        with gzip.open(os.path.join(tmp, "t.jsonl.gz"), "wt") as fh:
            fh.write(json.dumps({"r": "x " + gmail}) + "\n")
        assert check(tmp) != [], "a gzip with an address must fail the check"
    print("scrub self-test OK")
    return 0


def main(argv):
    if "--self-test" in argv:
        return self_test()
    if "--check" in argv:
        args = [a for a in argv[1:] if a != "--check"]
        if len(args) != 1:
            print("usage: scrub.py --check <dir>", file=sys.stderr)
            return 2
        found = check(args[0])
        for path, count in found:
            print("unredacted address(es): %d in %s" % (count, path))
        return 1 if found else 0
    if len(argv) != 2:
        print("usage: scrub.py <dir> | --check <dir> | --self-test", file=sys.stderr)
        return 2
    scrub_tree(argv[1])
    found = check(argv[1])
    for path, count in found:
        print("unredacted address(es): %d in %s" % (count, path))
    if found:
        return 1
    print("no unredacted address in %s" % argv[1])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
