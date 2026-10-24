#!/bin/sh
# surviving-lines UserPromptSubmit hint. Reads the hook input JSON on stdin. When the prompt is about
# authors, ownership or duplicate identities in git, it prints one JSON line that points the agent at
# the tool, lists suspected same-person groups from names and addresses and, when node and the plugin's own bin file
# exist, adds the tool's pre-computed whole-repository brief. Read-only git, no network, no writes (not even temp
# files), exit 0 always. Silent otherwise.
input=$(cat)
flat=$(printf '%s' "$input" | tr '\n\r' '  ' 2>/dev/null)
prompt=$(printf '%s' "$flat" | sed -E -n 's/.*"prompt"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p')
# Literal \n and \t escapes from the JSON become spaces, so "more than one\nname" still reads as words.
lc=$(printf '%s' "$prompt" | sed 's/\\[nrt]/ /g' | tr '[:upper:]' '[:lower:]' 2>/dev/null | cut -c1-4000)
[ -n "$lc" ] || exit 0

# Only the topic phrases are matched. A prompt that matches none of them costs one grep and nothing else.
printf '%s\n' "$lc" | grep -Eq \
  -e 'more than one (name|e-?mail|address)' \
  -e '(two|three|several|multiple|different) (names|e-?mails?|e-?mail addresses|identities|addresses)' \
  -e 'same person' \
  -e 'duplicate (author|contributor|name|e-?mail|identit)' \
  -e 'mailmap' \
  -e 'counted (twice|once)' \
  -e 'count each person once' \
  -e 'show(s)? up (in|under)' \
  -e 'who (owns|wrote|maintains|knows)' \
  -e 'whose code' \
  -e 'code ownership|codeowners' \
  -e 'bus factor' \
  -e 'who should review' \
  -e 'surviving lines' \
  -e 'git blame' \
  -e 'top (author|contributor)s?' \
  -e 'history of (this|the|a) (file|directory|folder|path)' \
  -e 'who shaped' \
  -e 'multiple (git )?identities' \
  -e 'main author' \
  -e 'top committers?' \
  -e 'ownership by' \
  -e 'who (touched|changed)' \
  -e 'who is responsible for' \
  -e 'who actually (wrote|built|owns|maintains|knows)' \
  -e 'which (people|persons|authors|developers|engineers|contributors) (wrote|own|maintain|know|are|is|still|should)' \
  -e 'still (alive )?in (this|the) (repo|repository|code|codebase)' \
  -e 'losing (one|two|a few|a couple of)( or (one|two|three|a few))? (people|persons|developers|engineers|contributors)' \
  -e '(^|[^a-z])owner(s|ship)?([^a-z]|$)' \
  -e '(^|[^a-z])reviewers?([^a-z]|$)' \
  -e 'who (should|can|do|would) (i|we) (ask|talk|contact|go|turn)' \
  -e 'one[- ]person (project|library|package)' \
  -e '(inherited|took over|taking over|taken over|became (the )?maintainer)' \
  -e 'who is (really )?behind' \
  -e 'how much of (the|that|this) (code|library|package|crate|repo)' \
  -e 'really (theirs|his|hers|written by)' \
  -e 'who (really )?(wrote|built)' \
  -e 'authorship' \
  -e 'truck factor' \
  -e '(look|looks|seem|seems) like the (author|owner|maintainer)' \
  -e 'concentrated (in|among|with|on)' || exit 0

# Everything below is silent when git is missing, the directory is not a work tree, or the history is larger
# than the cap. Commit counting stops at 20001, so a huge repository is never walked to the end.
command -v git >/dev/null 2>&1 || exit 0
# A cwd key with a value this pattern cannot read (a JSON-escaped quote or backslash) must stay silent: falling
# back to "." would describe the hook process's own repository, not the user's. A missing key means ".".
cwd=$(printf '%s' "$flat" | sed -E -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"([^"\\]*)".*/\1/p')
if [ -z "$cwd" ]; then
  printf '%s' "$flat" | grep -Eq '"cwd"[[:space:]]*:' && exit 0
  cwd=.
fi
export GIT_OPTIONAL_LOCKS=0
[ "$(git -C "$cwd" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || exit 0
n=$(git -C "$cwd" rev-list --count --max-count=20001 HEAD 2>/dev/null)
case $n in ''|*[!0-9]*) exit 0 ;; esac
cap=${SURVIVING_LINES_HINT_CAP:-20000}
case $cap in ''|*[!0-9]*) cap=20000 ;; esac
[ "$n" -le "$cap" ] || exit 0

# The command the agent runs. It is written into JSON text, so the quotes are escaped here; the plugin root is
# stripped of control characters, quotes and backslashes first. Without the bin file the agent gets the bare name.
root=$(printf '%s' "${CLAUDE_PLUGIN_ROOT:-}" | tr -d '\000-\037"\\' 2>/dev/null)
if [ -n "$root" ] && [ -f "$root/bin/surviving-lines.js" ]; then
  cmd='node \"'"$root"'/bin/surviving-lines.js\"'
else
  cmd='surviving-lines'
fi

intro="This request is about who wrote or owns code in git. Use the surviving-lines skill; SL = $cmd is the command: run SL instead of counting by hand. Every count, share, bus factor, activity and ownership claim comes from SL, not git blame or shortlog; a number SL does not print is your own: say so and name the command. Quote both line counts. Identity merges are proposals unless asked to apply them."
closing_groups="These groups are guesses. If asked to fix the duplicates, write the suggested lines to .mailmap under a proposal comment, re-run SL, and say they are unconfirmed guesses. SL --identities prints the lines; SL --merge-identities merges in memory only."
closing_none="No same-person groups were suspected from names and addresses; that does not prove there are none. Run SL --identities to check."

# The group text gets whatever room the fixed sentences leave, so the context stays within 1,200 characters
# (the brief, when there is one, comes on top of that).
budget=$((1190 - ${#intro} - ${#closing_groups} - 69))
[ "$budget" -gt 0 ] || budget=0

# One awk pass over the shortlog (first 3000 lines). A record is one (name, address) pair with its commit count.
# Bots are dropped first. Then the rules link records, and union-find turns the links into groups:
#   R1 the same name on two or more addresses
#   R2 the same address under two or more names
#   R3 the same local part (dots, dashes and underscores ignored, noreply digits and + removed) on different domains
#   R4 a GitHub noreply login equal to another record's local part or to another record's name without punctuation
# Output is one line: group count, shown group count, then the group text. Names and addresses are cleaned here.
out=$(git -C "$cwd" shortlog -sne --no-merges HEAD 2>/dev/null | head -3000 | awk -v budget="$budget" '
BEGIN {
  FS = "\t"
  generic = " dev admin info git hello mail noreply contact support team root user build ci bot test email work home me "
  tags[1] = "same name"; tags[2] = "same address, other name"; tags[3] = "same local part"; tags[4] = "noreply login"
}
# Anything outside printable ASCII becomes "?" first, so every later substr cuts whole characters in any awk.
function clean(s) { gsub(/[^ -~]/, "?", s); gsub(/["\\]/, "", s); return s }
function ok_key(k) { return length(k) >= 3 && index(generic, " " k " ") == 0 }
function find(x,   r, nx) {
  r = x
  while (par[r] != r) r = par[r]
  while (par[x] != r) { nx = par[x]; par[x] = r; x = nx }
  return r
}
function link(a, b, rule,   ra, rb) {
  ne++; ef[ne] = a; er[ne] = rule
  ra = find(a); rb = find(b)
  if (ra != rb) par[rb] = ra
}
{
  rest = substr($0, index($0, "\t") + 1)
  if (match(rest, /<[^<]*>$/) == 0) next
  oa = substr(rest, RSTART + 1, RLENGTH - 2)
  oname = substr(rest, 1, RSTART - 1); sub(/ +$/, "", oname)
  ea = tolower(oa); en = tolower(oname)
  c = $1; gsub(/[^0-9]/, "", c); c = c + 0
  if (en ~ /\[bot\]/ || ea ~ /\[bot\]@|noreply@github\.com|dependabot|renovate/) next
  key = en SUBSEP ea
  if (!(key in id)) {
    nr++; id[key] = nr; par[nr] = nr
    rname[nr] = en; raddr[nr] = ea; dname[nr] = oname; daddr[nr] = oa; rcount[nr] = 0
  }
  rcount[id[key]] += c
}
END {
  for (i = 1; i <= nr; i++) {
    at = index(raddr[i], "@")
    if (at > 0) { dom[i] = substr(raddr[i], at + 1); loc = substr(raddr[i], 1, at - 1) } else { dom[i] = ""; loc = raddr[i] }
    if (dom[i] == "users.noreply.github.com") { sub(/^[0-9]+\+/, "", loc); isnr[i] = 1; login[i] = loc }
    nl[i] = loc; gsub(/[._-]/, "", nl[i])
    sq[i] = rname[i]; gsub(/[^a-z0-9]/, "", sq[i])
    if (rname[i] != "") { if (rname[i] in f1) link(f1[rname[i]], i, 1); else f1[rname[i]] = i }
    if (raddr[i] in f2) link(f2[raddr[i]], i, 2); else f2[raddr[i]] = i
    if (dom[i] != "" && ok_key(nl[i])) {
      for (k = 1; k <= cl[nl[i]]; k++) { j = mem[nl[i], k]; if (dom[j] != dom[i]) link(j, i, 3) }
      cl[nl[i]]++; mem[nl[i], cl[nl[i]]] = i
    }
    if (sq[i] != "") { cs[sq[i]]++; smem[sq[i], cs[sq[i]]] = i }
  }
  for (i = 1; i <= nr; i++) {
    if (!(isnr[i] && ok_key(login[i]))) continue
    for (k = 1; k <= cl[login[i]]; k++) { j = mem[login[i], k]; if (j != i) link(i, j, 4) }
    for (k = 1; k <= cs[login[i]]; k++) { j = smem[login[i], k]; if (j != i) link(i, j, 4) }
  }
  for (e = 1; e <= ne; e++) gr[find(ef[e]) SUBSEP er[e]] = 1
  for (i = 1; i <= nr; i++) { r = find(i); gsz[r]++; gtot[r] += rcount[i] }
  ng = 0
  for (i = 1; i <= nr; i++) { r = find(i); if (gsz[r] >= 2 && !(r in seen)) { seen[r] = 1; ng++; roots[ng] = r } }
  # Largest groups first by commit count; insertion sort keeps the order stable for equal counts.
  for (a = 2; a <= ng; a++) {
    v = roots[a]; b = a - 1
    while (b >= 1 && gtot[roots[b]] < gtot[v]) { roots[b + 1] = roots[b]; b-- }
    roots[b + 1] = v
  }
  text = ""; shown = 0
  for (g = 1; g <= ng; g++) {
    r = roots[g]; rules = ""
    for (q = 1; q <= 4; q++) if ((r SUBSEP q) in gr) rules = rules (rules == "" ? "" : "; ") "R" q " " tags[q]
    members = ""
    for (i = 1; i <= nr; i++)
      if (find(i) == r) members = members (members == "" ? "" : "; ") substr(clean(dname[i]), 1, 60) " (" substr(clean(daddr[i]), 1, 80) ") " rcount[i] (rcount[i] == 1 ? " commit" : " commits")
    if (shown >= 5) break
    # Same address under several names: the exact two-address .mailmap line, for the agent to copy, not to write.
    copy = ""
    if ((r SUBSEP 2) in gr) {
      delete best
      for (i = 1; i <= nr; i++) {
        if (find(i) != r) continue
        a = raddr[i]; sp = (dname[i] ~ / /) ? 1 : 0
        if (!(a in best) || sp > bsp[a] || (sp == bsp[a] && rcount[i] > rcount[best[a]])) { best[a] = i; bsp[a] = sp }
      }
      for (i = 1; i <= nr; i++) {
        if (find(i) != r) continue
        a = raddr[i]
        if (best[a] == i) continue
        # A name that clean() would change cannot be copied faithfully: leave the line out rather than print a wrong one.
        if (clean(dname[best[a]]) != dname[best[a]] || clean(dname[i]) != dname[i] || length(dname[best[a]]) > 60 || length(dname[i]) > 60) continue
        copy = copy (copy == "" ? "" : "; ") substr(clean(dname[best[a]]), 1, 60) " <" substr(clean(daddr[best[a]]), 1, 80) "> " substr(clean(dname[i]), 1, 60) " <" substr(clean(daddr[i]), 1, 80) ">"
      }
    }
    piece = "[" rules "] " members
    if (copy != "") piece = piece "; .mailmap line, copy it as is: " copy
    if (length(text) + length(piece) + 3 > budget) break
    text = text (text == "" ? "" : " | ") piece
    shown++
  }
  print ng "\t" shown "\t" text
}
' 2>/dev/null)

ng=$(printf '%s\n' "$out" | cut -f1)
shown=$(printf '%s\n' "$out" | cut -f2)
groups=$(printf '%s\n' "$out" | cut -f3-)
case $ng in ''|*[!0-9]*) ng=0 ;; esac
case $shown in ''|*[!0-9]*) shown=0 ;; esac

# The pre-computed brief. It runs only when node and the plugin's own bin file exist; the tool stops itself after
# 20 seconds and then prints nothing, and any failure leaves the text empty, which behaves exactly as before.
# Output is read through a pipe (no temp file), cut to 3,500 characters, and made safe for JSON: bytes outside
# printable ASCII become "?", quotes and backslashes become apostrophes, line breaks become the two characters
# \n. The 1,200-character budget above is for the group text only; the brief comes on top of it.
brief=
if [ -n "$root" ] && [ -f "$root/bin/surviving-lines.js" ] && command -v node >/dev/null 2>&1; then
  brief=$(node "$root/bin/surviving-lines.js" --cwd "$cwd" --brief --quiet --time-budget 20 2>/dev/null </dev/null | LC_ALL=C tr '"\\' "'" 2>/dev/null | LC_ALL=C sed 's/[^ -~]/?/g' 2>/dev/null | head -c 3500 2>/dev/null | awk '{ printf "%s%s", sep, $0; sep = "\\n" }' 2>/dev/null)
fi
sha7=$(git -C "$cwd" rev-parse --short=7 HEAD 2>/dev/null | tr -d '\000-\037"\\ ' 2>/dev/null)

ctx="$intro"
if [ -n "$brief" ] && [ -n "$sha7" ]; then
  ctx="$ctx Pre-computed ownership brief for this repository at $sha7 (whole repository, computed by SL just now; these numbers are authoritative, do not recount with git blame): $brief"
fi
if [ "$ng" -gt 0 ]; then
  ctx="$ctx Suspected same-person groups ($ng found, $shown shown; from names and addresses only)"
  if [ "$shown" -gt 0 ]; then ctx="$ctx: $groups."; else ctx="$ctx."; fi
  ctx="$ctx $closing_groups"
else
  ctx="$ctx $closing_none"
fi
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' "$ctx"
exit 0
