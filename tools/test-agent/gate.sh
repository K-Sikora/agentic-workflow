#!/usr/bin/env bash
# Usage: gate.sh <since-sha> [base-sha]
# Applies the agent's patch to the current checkout and verifies it. Results go to $RUNNER_TEMP/test-agent-gate.
set -euo pipefail

since="$1"
base="${2:-}"
here="$(cd "$(dirname "$0")" && pwd)"
out="$RUNNER_TEMP/test-agent-gate"
mkdir -p "$out"

git -c user.name=test-agent-gate -c user.email=gate@invalid am /tmp/gh-aw/aw-*.patch

# Fail closed, and check which files changed before installing anything.
node "$here/verify.mjs" --since "$since" --policy-only --out "$out/verify.json" --markdown "$out/verify.md"

bash "$here/install.sh"

status=0
node "$here/verify.mjs" --since "$since" ${base:+--base "$base"} --out "$out/verify.json" --markdown "$out/verify.md" || status=$?
cat "$out/verify.md" >> "$GITHUB_STEP_SUMMARY"
exit "$status"
