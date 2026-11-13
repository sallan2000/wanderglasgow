#!/usr/bin/env bash
set -u
cd /home/stevie/wanderglasgow || exit 1
LOG=/home/stevie/wanderglasgow/artifacts/glasgow-walks/browser-suite.log
: > "$LOG"

step() {
  local label="$1"
  echo "===== $label =====" | tee -a "$LOG"
  pnpm --filter @workspace/glasgow-walks run "$label" >> "$LOG" 2>&1
  local rc=$?
  if [ $rc -eq 0 ]; then echo "[PASS] $label"; else echo "[FAIL] $label (exit $rc)"; fi
  echo "" | tee -a "$LOG"
}

step test:planner
step test:walks
step test:itinerary:browser
step test:access:browser
step test:starting-areas:browser
step test:email:browser

echo "===== SUMMARY =====" | tee -a "$LOG"
grep -E '^\[|PASS|FAIL' "$LOG"
