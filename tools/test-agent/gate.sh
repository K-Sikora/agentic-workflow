#!/usr/bin/env bash
# Usage: gate.sh <since-sha> [base-sha]
# Applies the agent's patch to the current checkout and verifies it. Results go to $RUNNER_TEMP/test-agent-gate.
set -euo pipefail

since="$1"
base="${2:-}"
here="$(cd "$(dirname "$0")" && pwd)"
out="$RUNNER_TEMP/test-agent-gate"
image="node:22.23.3-bookworm@sha256:69a5713e7f4997e96d579aafd78734810e0dac0dd5ee4621d72c27a2891a4088"
mkdir -p "$out"

git -c user.name=test-agent-gate -c user.email=gate@invalid am /tmp/gh-aw/aw-*.patch

# Fail closed, and check which files changed before installing anything.
node "$here/verify.mjs" --since "$since" --policy-only --out "$out/verify.json" --markdown "$out/verify.md"

bash "$here/install.sh"
docker pull --quiet "$image" > /dev/null

# The checks execute the agent's tests, so they run without network access and without the job's credentials.
# Fail closed if the container can reach the internet after all.
if docker run --rm --network none "$image" node -e "setTimeout(() => process.exit(1), 5000); require('node:net').connect(443, '1.1.1.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"; then
  echo "The verification container has network access; refusing to run the agent's tests." >&2
  exit 1
fi
echo "Running the checks in $image with --network none."
status=0
docker run --rm --network none --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -v "$here:/tools:ro" -v "$out:/out" -w /work \
  -e HOME=/tmp -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*' \
  "$image" node /tools/verify.mjs --since "$since" ${base:+--base "$base"} --out /out/verify.json --markdown /out/verify.md || status=$?
cat "$out/verify.md" >> "$GITHUB_STEP_SUMMARY" || true
exit "$status"
