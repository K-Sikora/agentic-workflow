# Solution: unit test agent and agentic PR workflow

A custom agent with reusable skills writes and maintains unit tests for the Taskly backend and frontend. It runs on GitHub in two workflows: one on every pull request, one on demand to raise coverage across a package. Its work is verified independently before anything reaches the pull request.

**Results**

- Coverage of the existing code, written by the agent: backend 33.0% to 97.4% lines and 98.0% branches, frontend 47.7% to 100% lines and 99.3% branches (PRs [#1](https://github.com/K-Sikora/agentic-workflow/pull/1), [#2](https://github.com/K-Sikora/agentic-workflow/pull/2), [#3](https://github.com/K-Sikora/agentic-workflow/pull/3), [#7](https://github.com/K-Sikora/agentic-workflow/pull/7)).
- Pull request runs cover four outcomes: tests created, existing tests updated for a deliberate change, a suspected bug reported instead of hidden, and a skip without starting the model (see [Example runs](#example-runs)).
- The model proposes, deterministic code decides: every test change is re-checked by a gate that does not trust the agent.

## At a glance

```
pull request
  |
  |  1. Prepare (no model)       trusted tools from the base branch, npm ci, change analysis
  |                              nothing testable, or the agent's own commit -> end here, no model call
  v
  2. Agent (sandboxed)           unit-test-agent + 5 skills, read-only token, network allowlist
  |                              writes tests, runs them, self-checks with verify.mjs, drafts a report
  v
  3. Gate (fail closed)          fresh checkout + agent patch: path policy, typecheck, full suites,
  |                              Prettier, repeated shuffled runs, run new tests against the old code
  v
  4. Publish                     push tests to the PR branch, agent report comment,
                                 measured verification comment (separate workflow on main)
```

## Where things live

| Path | What it is |
|---|---|
| `.claude/agents/unit-test-agent.md` | The custom agent: role, hard rules, inputs, procedure |
| `.claude/skills/test-triage/` | Decide create, update, skip or bug per changed file |
| `.claude/skills/backend-unit-tests/` | Backend conventions from this repo: flat `tests/`, Prisma without a database, supertest, env and process code |
| `.claude/skills/frontend-unit-tests/` | Frontend conventions: colocated tests, design-system mocks, TanStack Query hooks, `fetch`, Prettier |
| `.claude/skills/test-verification/` | Fix loop (max 3 attempts), the gate, "does the test detect the change", quality checklist |
| `.claude/skills/test-report/` | Report format for the PR comment or PR body |
| `.claude/settings.json` | Keeps agent commits free of tool attribution trailers |
| `tools/test-agent/analyze.mjs` | Facts for the agent: testable files, existing tests (import graph, ignoring `vi.mock`), changed lines, uncovered lines, missed branches, failing tests |
| `tools/test-agent/verify.mjs` | The gate, also used by the agent as a self-check |
| `tools/test-agent/gate.sh`, `install.sh` | Gate entry point in CI; dependency install with one retry |
| `tools/test-agent/lib.test.mjs` | Tests for the tooling (`node --test`), run in CI |
| `.github/workflows/unit-test-agent.md` | gh-aw workflow for pull requests (source; `.lock.yml` is the compiled Actions file) |
| `.github/workflows/test-backfill.md` | gh-aw workflow that covers one package and opens a PR |
| `.github/workflows/unit-test-agent-report.yml` | Posts the gate's measured result on the PR |
| `.github/workflows/ci.yml` | Plain CI: typecheck, Prettier, tests with coverage, tooling tests |
| `.github/workflows/smoke-openrouter.md` | Manual check that the model provider is reachable |

The agent and skills use the standard Claude Code format, so the same files run in CI and in a local Claude Code session.

## Main technical decisions

- **GitHub Agentic Workflows (gh-aw) with the Claude Code engine.** gh-aw gives the security model an agent on pull requests needs: the agent job has a read-only token and a network allowlist, the model key stays in a proxy outside the agent container, and every write goes through typed safe outputs applied by a separate job. The workflow is Markdown plus frontmatter, compiled to a normal Actions file.
- **Native Claude Code agent and skills.** The workflow starts Claude Code with `--agent unit-test-agent`; skills in `.claude/skills/` are discovered and loaded on demand. On pull requests gh-aw restores `.claude/` from the base branch, so a PR cannot rewrite the agent's instructions.
- **Model through OpenRouter.** `ANTHROPIC_BASE_URL` points the engine at OpenRouter's Anthropic-compatible API and `ANTHROPIC_API_KEY` is mapped from the `OPENROUTER_API_KEY` secret. Sonnet 5.5 writes tests; Haiku 5.5 runs gh-aw's threat detection. Removing the two `engine.env` lines switches to Anthropic directly.
- **Deterministic facts, model judgment.** Everything with a correct answer is computed by scripts: which files changed, which are testable (mirroring the coverage config), which tests import them, which changed lines and which conditions are not covered, which tests already fail. Missed branches matter on their own: a file can run every line while one side of a condition is never tested. The model decides what is worth testing and how, and writes the tests.
- **Independent gate, fail closed.** `verify.mjs` runs on a fresh checkout with the agent's patch, from the base branch's copy of the tools. It refuses any change outside test files before installing anything, then runs typecheck, the full suites, Prettier and three shuffled runs of the new tests. If any check fails, gh-aw applies no safe output: nothing is pushed and no comment is posted.
- **Tests must detect the change.** The gate also runs the new tests against the code before the change in a temporary worktree. Tests for new behavior should fail there; the skill tells the agent to strengthen assertions when they do not. The result is reported per test file.
- **Bugs are reported, not encoded.** If the code contradicts the stated intent, the agent leaves the tests alone and explains the suspected bug with file and line.
- **No model call when there is nothing to do.** A docs-only change, or a run triggered by the agent's own commit, ends in a `noop` before the engine starts.
- **One agent, two entry points.** The backfill workflow reuses the same agent, skills and gate in "whole package" mode and opens a pull request, limited by `max-files` so each PR stays reviewable.

## Security

| Risk | Mitigation |
|---|---|
| Agent edits application code, config or workflows | `allowed-files` on the push and PR safe outputs; same policy in the gate, checked before `npm ci`; gh-aw protected files (`.github/`, `.claude/`) |
| PR weakens its own checks | Analysis and gate run `tools/test-agent` extracted from the base commit; `.claude/` restored from the base branch |
| Prompt injection in PR text or code | Agent rules treat PR content as data; gh-aw threat detection; fail-closed detection job |
| Secret leaks | Model key held by the gh-aw API proxy and excluded from the agent container; test processes run with tokens and keys removed from the environment; agent job token is read-only |
| Untrusted contributors | No `pull_request_target`; fork PRs get no secrets; `roles: [admin, maintainer, write]`; bot-triggered runs are skipped |
| Runaway cost or loops | `max-turns`, timeouts, per-PR concurrency, `noop` before the model, skip when the newest change is the agent's own commit |
| Supply chain | Actions pinned by SHA, gh-aw version pinned, `npm ci` from lockfiles, default workflow permissions `read` |

## Running the PR workflow

Prerequisites:

1. Repository secret `OPENROUTER_API_KEY` (or an Anthropic key with the two `engine.env` lines removed). Set a spending limit on the key.
2. Optional but recommended: secret `GH_AW_CI_TRIGGER_TOKEN`, a fine-grained PAT for this repository with Contents read and write. Commits and PRs created with the default `GITHUB_TOKEN` do not start other workflows; with this token gh-aw adds an empty commit so CI runs on the agent's changes.
3. For the backfill workflow: Settings, Actions, General, "Allow GitHub Actions to create and approve pull requests". Workflow permissions stay "Read".

Usage:

- Open or update a non-draft pull request that changes `backend/` or `frontend/`. The agent runs automatically. Add the label `skip-test-agent` to opt out.
- Backfill: Actions, "Unit test backfill", Run workflow, choose `backend` or `frontend`.
- Provider check: Actions, "Smoke test (OpenRouter)", Run workflow.
- After editing a workflow source: `gh extension install github/gh-aw` (v0.93.2), then `gh aw compile`.

Locally, the same agent runs in Claude Code: `claude --agent unit-test-agent`, then for example "Mode: pr. Base: origin/main." The tools also run on their own:

```
node tools/test-agent/analyze.mjs --base origin/main --coverage --markdown .test-agent/analysis.md
node tools/test-agent/verify.mjs --since origin/main --base origin/main
node --test "tools/test-agent/*.test.mjs"
```

## Coverage

Measured by CI on `main` before the work and after the backfill and demo PRs:

| Package | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| backend, before | 33.0% | 30.2% | 33.3% | 40.6% |
| backend, after | 97.4% | 97.1% | 98.0% | 97.0% |
| frontend, before | 47.7% | 46.4% | 43.8% | 40.3% |
| frontend, after | 100% | 99.5% | 99.3% | 100% |

The only uncovered backend lines are in `src/main.ts` (process entry point, skipped on purpose). Most remaining branches are defensive guards the agent chose not to force, for example `if (pending) return` in `DeleteTodoDialog.tsx`, which the UI cannot reach because the buttons are disabled while a delete is pending.

Branch coverage was a second step. After the first backfills the frontend had 100% lines but 92% branches: `TodoItem.tsx` ran every line in one test while most of its conditions (completed, overdue, with description) were never checked. The analysis now reports missed branches as well, and one more run ([#7](https://github.com/K-Sikora/agentic-workflow/pull/7)) took frontend branches from 92.4% to 99.3%.

## Example runs

Costs are gh-aw AI Credits as reported by each run (1 AIC = 0.01 USD at gh-aw's pricing weights).

| Pull request | What it shows | Agent decision and skills used | Verified result | Cost |
|---|---|---|---|---|
| [#4 Duplicate a task](https://github.com/K-Sikora/agentic-workflow/pull/4) ([run](https://github.com/K-Sikora/agentic-workflow/actions/runs/40019707918)) | New feature across backend and frontend; the author left 10 page tests broken | `create` for the route, API client, hook, button and list; `update` for `TodosPage.test.tsx` (mock for the new hook). Skills: triage, backend, frontend, verification, report | Gate ok: backend 98, frontend 123 tests, typecheck, Prettier, 3 stable runs. New tests fail on the old code (for example 7 of 25 in `router.test.ts`) | ~51 AIC |
| [#5 Allow longer task descriptions](https://github.com/K-Sikora/agentic-workflow/pull/5) ([run](https://github.com/K-Sikora/agentic-workflow/actions/runs/40019804664)) | Code contradicts the description: limit set to 500 instead of 5000 | `bug`: no test changes; points to `validators.ts:5`, explains why the existing test fails and what to change. Skills: triage, report | No patch, so nothing to verify. CI is red on the existing test, which is the intended signal; the PR was closed without merging | ~8 AIC |
| [#6 Describe the health check response](https://github.com/K-Sikora/agentic-workflow/pull/6) ([run](https://github.com/K-Sikora/agentic-workflow/actions/runs/40019815832)) | Documentation only | Analysis finds nothing unit-testable; the run ends with `noop` before the agent starts | No comment, no commit | <1 AIC (threat detection only) |
| [#1](https://github.com/K-Sikora/agentic-workflow/pull/1), [#2](https://github.com/K-Sikora/agentic-workflow/pull/2), [#3](https://github.com/K-Sikora/agentic-workflow/pull/3), [#7](https://github.com/K-Sikora/agentic-workflow/pull/7) backfill | Coverage of existing code, one package per run; #7 targets missed branches | `create` and `update` over the files with the largest gaps, up to `max-files`, highest risk first; guards unreachable from the UI are skipped with a reason | Gate ok on each; coverage in the table above | ~51, ~66, ~55, ~40 AIC |

What a run looks like on the PR (#4):

1. The agent pushes `test: cover duplicating a task (unit-test-agent)` to the PR branch.
2. Its report comment lists every decision with a reason, the tests per file, and which of them fail on the old code.
3. The "Unit test agent report" workflow adds a second comment with the gate's own measurements, so reviewers do not have to trust the agent's numbers.
4. With `GH_AW_CI_TRIGGER_TOKEN` set, an empty `ci: trigger checks` commit starts CI on the agent's changes. The agent run it triggers stops before the model because the newest change is the agent's own commit.

During development the same scenarios were run on a private copy of the repository first; issues found there (coverage missing when a PR has failing tests, a cancelled publish when the CI-trigger commit started a new run, transient `npm ci` network errors) are fixed in the workflow and tools.

## Assumptions

- Contributors are trusted collaborators; fork PRs are out of scope for the agent (they still get normal CI).
- "Unit test" means Vitest tests with mocked IO: no PostgreSQL, no network, as in the existing tests.
- Files excluded from coverage by the project config (design system, types, generated Prisma client, entry points) are not targets.
- The agent may extend existing tests but does not rewrite tests a person wrote, except for assertions on behavior the PR deliberately changed.

## Limitations

- The agent is not deterministic: two runs on the same change can write different tests. The gate guarantees they pass, are stable and touch only test files; it cannot guarantee they are the best tests.
- "Fails on the old code" is a strong signal but not mutation testing. A test file that cannot load on the old code counts as detecting the change.
- Without `GH_AW_CI_TRIGGER_TOKEN`, CI on the agent's own commit waits for manual approval.
- The gate checks the new tests with three shuffled runs, which catches common flakiness but not every timing issue.
- Code under test runs in the CI job with the PR's own dependencies; the design protects against the agent and against prompt injection, not against a malicious collaborator.
- OpenRouter is an extra party that sees the code sent to the model.

## For production

- Call the model provider directly (Anthropic or Azure) instead of through OpenRouter, with organization-level budgets.
- Add a small evaluation set of recorded changes with known correct decisions and track decision accuracy, detection rate and cost per run over time.
- Mutation testing on changed lines (for example Stryker) to measure test strength beyond "fails on the old code".
- Run the gate's test processes in a container without network access; today they run on the runner with credentials removed from the environment.
- Coverage thresholds per package in Vitest config, raised after each backfill, so coverage cannot drop.
- A GitHub App instead of a PAT for the CI trigger, and a required-reviewer environment for the agent secret.
