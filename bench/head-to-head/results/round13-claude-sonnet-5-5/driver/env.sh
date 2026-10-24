# Round 13 development-gate environment. All work under /private/tmp. Subscription wrapper first on PATH.
export PATH=<home>/claude-kredi-runs/sub-shim:$(echo "$PATH" | tr ':' '\n' | grep -v sdk-shim | paste -sd: -)
G=<home>/claude-kredi-runs/2026-10-22/sl-gate
export R=/private/tmp/r13/final
export B=<home>/Desktop/Open-Source/projelerim/surviving-lines/bench/head-to-head
export PP_DIR=$G/src/pp HIST_DIR=$G/src/hist-plugin BF_DIR=$G/src/bf-plugin GUARD_CMD=$G/guard.sh MODEL=claude-sonnet-5-5
export OURS_DIR=$R/ours-src
export PARALLEL=3
LIMIT_RE='hit your (session |usage |weekly )?limit|usage limit|weekly limit|session limit|api_error_status"?: ?(429|401)|HTTP 429|not logged in|credit guard|Invalid API key|OAuth token'
LOG=$R/drive.log
say() { echo "$(date +%T) $*" >> $LOG; }
limit_in_dir() { local d; for d in $1/runs/*/; do [ -f $d/final.txt ] && continue; [ -f $d/run.jsonl ] || continue; grep -qiE "$LIMIT_RE" $d/run.jsonl && { echo "$d"; return 0; }; done; return 1; }
stop_state() { { echo "# STOPPED $(date +%FT%T)"; echo; echo "$1"; } > $R/STATE.md; say "STOPPED: $1"; exit 9; }
