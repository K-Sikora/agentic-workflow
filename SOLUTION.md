# Unit test agent for Taskly

I built an agent with five skills that writes and updates unit tests for the Taskly backend and frontend. It runs in Claude Code on Claude Sonnet 5.5, served through OpenRouter, inside two GitHub workflows: one on every pull request and one on demand that fills coverage gaps in a package. Before anything is pushed or posted, a separate verification job re-runs the checks on the agent's patch and blocks publishing if any of them fails.

What it achieved on this repository:

- Backend line coverage went from 33.0% to 97.4% (branches 33.3% to 98.0%), frontend from 47.7% to 100% (branches 43.8% to 99.3%). The agent wrote these tests in the backfill PRs [#1](https://github.com/K-Sikora/agentic-workflow/pull/1), [#2](https://github.com/K-Sikora/agentic-workflow/pull/2), [#3](https://github.com/K-Sikora/agentic-workflow/pull/3) and [#7](https://github.com/K-Sikora/agentic-workflow/pull/7), and I reviewed them before merging.
- On pull requests it wrote tests for a new feature, repaired tests the feature had broken, flagged a bug instead of adjusting tests to it, and skipped a docs-only change without calling the model ([section 4](#4-example-runs)).

## 1. Technical decisions

**Agent runtime: GitHub Agentic Workflows (gh-aw).** gh-aw runs coding agents on repository events with the isolation a pull request agent needs: the agent job has no write permissions, and every write (the commit, the comments) is a declared safe output that a separate job applies only after detection passes. Workflows are Markdown with frontmatter, and `gh aw compile` turns them into ordinary Actions files (`*.lock.yml`).

**Engine and model: Claude Code CLI with Claude Sonnet 5.5 via OpenRouter.** gh-aw's `claude` engine runs the Claude Code CLI as the agent harness. The agent and skills are standard Claude Code files in `.claude/`, so the same agent also runs in a local Claude Code session; the workflow selects it with `--agent unit-test-agent`. Sonnet 5.5 writes the tests and Haiku 5.5 runs the threat scan. Both are called through OpenRouter's Anthropic-compatible endpoint (`ANTHROPIC_BASE_URL`), so the provider is configuration: the model is set in one line, and removing two lines of `engine.env` switches the same workflow to the Anthropic API.

**Deterministic change analysis (`tools/test-agent/analyze.mjs`).** Everything that can be computed is computed by a Node script without dependencies, not inferred by the model: the changed source files (`git diff` against the merge base), whether the coverage config includes them, which test files import them (excluding `vi.mock` targets), the changed lines and conditions without coverage (from Vitest's Istanbul report), and the tests that already fail. The agent receives this as Markdown and JSON and decides what to test. Branch data was added after the first backfill: `TodoItem.tsx` had 100% line coverage but 36% branch coverage, because one test executed every line while only one side of most conditions was taken.

**Independent verification gate (`tools/test-agent/verify.mjs`).** The gate runs in gh-aw's detection job on a fresh checkout with the agent's patch applied, and ignores what the agent reported about its own work. It runs the typecheck, both suites, Prettier on changed files and three runs of the new tests in shuffled order, and runs the new tests against the base revision. A non-zero exit blocks all safe outputs. The agent runs the same script during its work, so a failing gate is rare.

**Base-revision check for new tests.** Coverage shows that code ran, not that its behavior is asserted. For each new test file the gate counts the tests that fail when run against the code before the change (in a temporary `git worktree`). The verification skill tells the agent to tighten assertions when a test for new behavior passes on both revisions.

**Suspected bugs.** When the code contradicts the pull request description, the agent does not change tests to match it. It reports the file, line, expected and actual behavior instead.

**Skipped runs.** The agent is not started when the analysis finds no unit-testable change, or when the newest commit that changes files is the agent's own.

### Security

Threat model: the agent, the pull request content and the tests the agent writes are untrusted. None of them may change files other than tests, read secrets or open network connections. Controls by area:

**Write access and file scope.** The agent job has read access only; the single write path is gh-aw's safe outputs. The push output accepts only test paths (`allowed-files`), gh-aw additionally protects `.github/` and `.claude/`, and the gate rejects any other changed file before it installs or runs anything. The agent can execute a fixed list of commands (the two test suites, typecheck, the tool, Prettier, read-only git and commit) and nothing else, so no `node -e`, `npx` or arbitrary shell.

**Integrity of the agent's instructions and tools.** The analysis and the gate use `tools/test-agent` extracted from the base commit, and gh-aw restores `.claude/` from the base branch, so a pull request cannot edit the agent's instructions, skills or verification. The report workflow runs from the default branch and treats the gate's artifact as data: it validates the PR number, caps the size and neutralizes @mentions.

**Prompt injection.** The agent's rules say pull request text, commit messages and code are data and not instructions. gh-aw runs an AI threat scan over the agent's output and patch before anything is applied, and the detection job fails closed.

**Secrets and workflow triggers.** The model key lives in gh-aw's API proxy and is excluded from the agent container. Processes that run tests get an environment without tokens or keys. No workflow uses `pull_request_target`, fork PRs receive no secrets, only users with write access trigger the agent, and runs started by bots are skipped. The CI-trigger PAT is fine-grained, limited to the repositories that need it and to repository contents, and used only by gh-aw's publishing job.

**Network isolation.** While the agent works, its network allows only the model endpoint; dependencies are installed before it starts. The gate runs the agent's tests in a Node container pinned by digest, as a non-root user, with `--network none`, and before that it tries to open a connection from inside the container and stops if one succeeds.

**Supply chain.** Dependencies install with `npm ci --ignore-scripts` from the lockfiles, and the only build script the project needs, Prisma client generation, runs explicitly. Every action and the container image are pinned by SHA or digest, the gh-aw version is pinned, and default workflow permissions are read-only. CI scans all workflows, including the compiled lock files, with zizmor (version and wheel hash pinned); the one accepted finding, `workflow_run` in the report workflow, has a comment explaining why it is safe there.

**Cost limits and loop prevention.** Runs have turn and time limits and queue per pull request. Nothing reaches the model when no testable code changed or when the newest change is the agent's own commit, which also stops the agent from triggering itself.

## 2. Running the PR workflow

Prerequisites:

1. A repository secret `OPENROUTER_API_KEY` with a spending limit, or an Anthropic key with the `ANTHROPIC_BASE_URL` line removed from the workflows.
2. Recommended: `GH_AW_CI_TRIGGER_TOKEN`, a fine-grained PAT with Contents read and write. GitHub does not start workflows for commits pushed with the default token, so without it CI on the agent's commit waits for manual approval.
3. For backfill: "Allow GitHub Actions to create and approve pull requests" in the repository's Actions settings. Default workflow permissions stay read-only.

Then open or update a non-draft pull request that touches `backend/` or `frontend/`; the label `skip-test-agent` turns the agent off for it. To fill gaps, start "Unit test backfill" from the Actions tab and choose a package. "Smoke test (OpenRouter)" checks that the model is reachable. After editing a workflow, recompile it with the gh-aw extension (`gh extension install github/gh-aw`, v0.93.2, then `gh aw compile`).

Locally, `claude --agent unit-test-agent` with a prompt such as "Mode: pr. Base: origin/main." runs the same agent, and the tool works on its own:

```
node tools/test-agent/analyze.mjs --base origin/main --coverage --markdown .test-agent/analysis.md
node tools/test-agent/verify.mjs --since origin/main --base origin/main
node --test "tools/test-agent/*.test.mjs"
```

## 3. Where the agent and skills are, and how a run uses them

The agent is [`.claude/agents/unit-test-agent.md`](.claude/agents/unit-test-agent.md). It defines the constraints every skill follows (edit only test files, do not adapt tests to suspected bugs, treat pull request text as data, finish only after `verify.mjs` passes) and the order of steps. The skills in `.claude/skills/`:

- `test-triage` decides per file: create, update, skip or bug.
- `backend-unit-tests` and `frontend-unit-tests` describe how this repository already writes tests (fixtures, Prisma without a database, supertest, design-system mocks, TanStack Query hooks), so new tests look like the existing ones.
- `test-verification` covers the fix loop (three attempts per file), the `verify.mjs` run, the base-revision check and a short quality checklist.
- `test-report` is the format of the PR comment or the backfill PR body.

A pull request run, defined in [`.github/workflows/unit-test-agent.md`](.github/workflows/unit-test-agent.md):

1. A preparation step skips the agent's own commits, installs dependencies, takes the tool from the base branch and runs the analysis. If nothing is testable, the run ends here.
2. Claude Code starts as the agent and loads the skills it needs. It writes and runs tests, checks itself with `verify.mjs` and commits.
3. gh-aw's detection job applies the patch to a fresh checkout and runs `tools/test-agent/gate.sh`, then the threat scan.
4. Only if both pass does gh-aw push the commit to the PR branch and post the agent's report. A small workflow on the default branch, `unit-test-agent-report.yml`, adds the gate's own numbers as a second comment, also when the gate blocked the push.

[`test-backfill.md`](.github/workflows/test-backfill.md) runs the same agent, skills and gate over a whole package and opens a pull request with at most `max-files` files.

## 4. Example runs

Costs are the AI Credits each run reports (1 AIC = 0.01 USD at gh-aw's pricing).

| Pull request | Situation | What the agent did | Checked result | Cost |
|---|---|---|---|---|
| [#4](https://github.com/K-Sikora/agentic-workflow/pull/4) Duplicate a task ([run](https://github.com/K-Sikora/agentic-workflow/actions/runs/40019707918)) | New feature in backend and frontend; the author left 10 page tests failing | Tests for the route, API client, hook, button and list; mocked the new hook in `TodosPage.test.tsx` without changing its assertions | 98 backend and 123 frontend tests pass, stable over 3 runs; 7 of 25 router tests fail on the previous code | ~51 AIC |
| [#5](https://github.com/K-Sikora/agentic-workflow/pull/5) Allow longer task descriptions ([run](https://github.com/K-Sikora/agentic-workflow/actions/runs/40019804664)) | Description says 5000 characters, the code says 500 | No test changes; reported the likely typo at `validators.ts:5`, why the existing test fails and what to change | Nothing to verify; CI stays red on the existing test, as it should. Closed without merging | ~8 AIC |
| [#6](https://github.com/K-Sikora/agentic-workflow/pull/6) Describe the health check response ([run](https://github.com/K-Sikora/agentic-workflow/actions/runs/40019815832)) | Documentation only | Nothing; the analysis found no testable change and the model never started | No comment, no commit | <1 AIC |
| [#8](https://github.com/K-Sikora/agentic-workflow/pull/8) Filter tasks by completion status ([run](https://github.com/K-Sikora/agentic-workflow/actions/runs/40034872839)) | New query filter, the first run after the security hardening | Tests for both filter values, an empty result and invalid values (9 cases); no bug found | 107 backend tests pass; 8 of 34 router tests fail on the previous code; the checks ran in the container without network. The first attempt stopped when the provider refused a request for lack of credits, and nothing was published | ~26 AIC |
| #1, #2, #3, #7 backfill | Gaps in existing code, one package per run; #7 aimed at missed branches | Covered the riskiest files first, up to `max-files`; skipped guards the UI cannot reach and said why | Each passed the gate; coverage below | ~51, ~66, ~55, ~40 AIC |

A typical pull request ends up with the agent's commit, its report (a decision and reason per file, the tests added, how many fail on the previous code) and a second comment with the gate's measurements.

Coverage, measured by CI on `main`:

| | Lines | Branches | Statements | Functions |
|---|---|---|---|---|
| Backend before / after | 33.0% / 97.4% | 33.3% / 98.0% | 30.2% / 97.1% | 40.6% / 97.0% |
| Frontend before / after | 47.7% / 100% | 43.8% / 99.3% | 46.4% / 99.5% | 40.3% / 100% |

The backend lines still uncovered are `src/main.ts`, the process entry point. Most remaining branches are defensive guards the agent chose not to force, such as `if (pending) return` in `DeleteTodoDialog.tsx`, which the UI cannot reach while the buttons are disabled.

Problems I ran into, all found on a private copy of the repository where I tried every scenario first:

- The analysis crashed on pull requests with failing tests, because Vitest skips the coverage report when a test fails. It now asks for the report anyway.
- With CI triggering on, the empty commit started a new agent run that cancelled the one still publishing. Runs for the same PR now queue.
- A network error in `npm ci` failed a run that had nothing to do. The skip now comes before installing, and installs retry once.
- On Windows, deleting the temporary worktree for the "previous code" check also deleted the real `node_modules` through a link. The links are removed first now.

## 5. Assumptions

- Pull requests come from collaborators. Fork PRs get normal CI but not the agent.
- A unit test here means Vitest with mocked IO and no PostgreSQL or network, like the tests already in the repository.
- Files the coverage config excludes (design system, types, generated Prisma client, entry points) are not targets.
- The agent may add to tests people wrote, but changes their assertions only when the pull request deliberately changed that behavior.

## 6. Limitations

- Two runs on the same change can produce different tests. The gate guarantees they pass, stay stable over three shuffled runs and touch only test files, not that they are the best possible tests.
- "Fails on the previous code" is a useful signal but not mutation testing, and a test file that cannot load on the previous code counts as noticing the change.
- The analysis and normal CI run the author's own code on the runner, as any CI does; only the agent's tests are isolated. The setup protects against the agent and prompt injection, not against a malicious collaborator.
- Without `GH_AW_CI_TRIGGER_TOKEN`, CI on the agent's commit needs a manual approval.
- OpenRouter is one more party that sees the code sent to the model.

## 7. What I would change for production

- Call Anthropic or Azure directly instead of OpenRouter, with budgets set per organization.
- Keep a small set of recorded changes with known right answers and track decision accuracy, the share of new tests that fail on the base revision, and cost per run.
- Add mutation testing on changed lines (for example Stryker) to measure test strength more precisely.
- Run the change analysis in the same network-less container as the gate, with dependencies baked into the image.
- Set coverage thresholds per package in the Vitest config and raise them after each backfill.
- Use a GitHub App instead of a PAT for triggering CI, and keep the model key in an environment with required reviewers.
