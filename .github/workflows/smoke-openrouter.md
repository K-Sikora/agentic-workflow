---
name: Smoke test (OpenRouter)
description: Checks that the Claude engine reaches Anthropic models through OpenRouter.
on:
  workflow_dispatch:
permissions:
  contents: read
engine:
  id: claude
  model: anthropic/claude-haiku-5.5
  env:
    ANTHROPIC_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    ANTHROPIC_BASE_URL: https://openrouter.ai/api
network:
  allowed: [defaults, openrouter.ai]
safe-outputs:
  create-issue: false
  noop:
    report-as-issue: false
  report-failure-as-issue: false
  report-failed-jobs: false
max-turns: 5
timeout-minutes: 10
---

List the top-level directories of this repository and describe the project in one sentence.

Finish by calling the `noop` safe output with that sentence as the message.
