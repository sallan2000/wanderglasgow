#!/usr/bin/env bash
set -u
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd) || exit 1
cd -- "$script_dir/../.." || exit 1
LOG="$script_dir/browser-suite.log"
: > "$LOG" || exit 1
failed=0

step() {
  local label="$1"
  echo "===== $label =====" | tee -a "$LOG"
  pnpm --filter @workspace/glasgow-walks run "$label" >> "$LOG" 2>&1
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "[PASS] $label" | tee -a "$LOG"
  else
    echo "[FAIL] $label (exit $rc)" | tee -a "$LOG"
    failed=1
  fi
  echo "" | tee -a "$LOG"
}

step test:planner
step test:walks
step test:itinerary:browser
step test:access:browser
step test:category:browser
step test:starting-areas:browser
step test:email:browser
step test:walks:browser

echo "===== SUMMARY =====" | tee -a "$LOG"
grep -E '^\[(PASS|FAIL)\]' "$LOG"
exit "$failed"
