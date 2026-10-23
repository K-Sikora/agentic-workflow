---
name: Unit test backfill
description: Runs the unit test agent over one package to add missing tests, verifies them independently and opens a pull request.
on:
  workflow_dispatch:
    inputs:
      package:
        description: Package to cover
        type: choice
        options: [backend, frontend]
        required: true
      max-files:
        description: Maximum number of source files to cover in this run
        type: string
        default: "12"
  roles: [admin, maintainer, write]
permissions:
  contents: read
  pull-requests: read
concurrency:
  group: test-backfill-${{ github.event.inputs.package }}
  cancel-in-progress: false
  job-discriminator: ${{ github.run_id }}
engine:
  id: claude
  model: anthropic/claude-sonnet-5.5
  args: ["--agent", "unit-test-agent"]
  env:
    ANTHROPIC_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    ANTHROPIC_BASE_URL: https://openrouter.ai/api
network:
  allowed: [defaults, node, openrouter.ai]
tools:
  edit:
  bash: ["npm:*", "node:*", "git status", "git diff:*", "git log:*", "git show:*", "git add:*", "git commit:*", "cat", "ls", "head", "tail", "grep", "wc", "jq"]
pre-agent-steps:
  - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
    with:
      node-version: 22
      cache: npm
      cache-dependency-path: |
        backend/package-lock.json
        frontend/package-lock.json
  - name: Install dependencies
    run: bash tools/test-agent/install.sh
  - name: Analyse coverage gaps
    env:
      PACKAGE: ${{ github.event.inputs.package }}
    run: |
      node tools/test-agent/analyze.mjs --all --package "$PACKAGE" --coverage --markdown .test-agent/analysis.md
      cat .test-agent/analysis.md >> "$GITHUB_STEP_SUMMARY"
      if [ "$(jq '.summary.actionable' .test-agent/analysis.json)" = "0" ]; then
        outputs="${GH_AW_SAFE_OUTPUTS:-$RUNNER_TEMP/gh-aw/safeoutputs/outputs.jsonl}"
        mkdir -p "$(dirname "$outputs")"
        echo '{"type":"noop","message":"Every unit-testable file in this package is fully covered."}' >> "$outputs"
      fi
safe-outputs:
  create-issue: false
  noop:
    report-as-issue: false
  report-failure-as-issue: false
  report-failed-jobs: false
  create-pull-request:
    draft: false
    fallback-as-issue: false
    if-no-changes: ignore
    allowed-files:
      - "backend/tests/**"
      - "frontend/src/*.test.ts"
      - "frontend/src/*.test.tsx"
      - "frontend/src/**/*.test.ts"
      - "frontend/src/**/*.test.tsx"
      - "frontend/src/test/**"
  threat-detection:
    engine:
      id: claude
      model: anthropic/claude-haiku-5.5
    continue-on-error: false
    report-as-issue: false
    steps:
      - name: Check out the dispatched commit for verification
        if: needs.agent.outputs.has_patch == 'true'
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.sha }}
          path: gate
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        if: needs.agent.outputs.has_patch == 'true'
        with:
          node-version: 22
      - name: Verify the agent's changes
        if: needs.agent.outputs.has_patch == 'true'
        working-directory: gate
        run: bash tools/test-agent/gate.sh "$GITHUB_SHA"
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        if: always() && needs.agent.outputs.has_patch == 'true'
        with:
          name: test-agent-gate
          path: ${{ runner.temp }}/test-agent-gate
          if-no-files-found: ignore
max-turns: 200
timeout-minutes: 60
---

# Raise unit test coverage in `${{ github.event.inputs.package }}`

Mode: `all`. Work only on source files under `${{ github.event.inputs.package }}/` and cover at most ${{ github.event.inputs.max-files }} of them, the highest-risk gaps first. Before you change anything, record the starting commit with `git rev-parse HEAD`.

The coverage analysis is in `.test-agent/analysis.md`, with details in `.test-agent/analysis.json`.

Follow your agent instructions and skills. Run the gate as `node tools/test-agent/verify.mjs --since <starting commit>`.

Publishing:

- Commit the tests with a message like `test(${{ github.event.inputs.package }}): cover <areas> (unit-test-agent)` and no trailers.
- Call `create_pull_request` once. Title: `test(${{ github.event.inputs.package }}): raise unit test coverage`. Body: the report from the `test-report` skill in `all` mode, with line and branch coverage before and after for every file you touched.
- If no file needed tests, call `noop` and say why.
