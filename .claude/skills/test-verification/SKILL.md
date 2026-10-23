---
name: test-verification
description: Run, fix and independently verify new or updated unit tests, including whether they detect the change. Use after writing tests and before reporting.
---

# Test verification

## 1. Per test file

1. Run the file alone (see the backend or frontend skill for the command).
2. On failure, read the assertion and the source and decide:
   - **The test is wrong** (bad setup, wrong expectation of documented behavior): fix the test. At most 3 attempts per file.
   - **The code is wrong** (contradicts the pull request intent, its types or its naming): do not change the test to match. Remove that case from the change and keep its code and failure message for the report as a suspected bug.
   - Still failing after 3 attempts: remove the file from the change and report it as not verified.
3. Typecheck the package: `npm --prefix <backend|frontend> run typecheck`.
4. Frontend only: format the file with Prettier.

## 2. Gate

Run the same check CI runs. `--since` is the commit before your changes (the pull request head given in the task prompt, or `HEAD` locally); add `--base` in pull request mode:

```
node tools/test-agent/verify.mjs --since <sha> --base <base-sha> --markdown .test-agent/verify.md
```

It refuses changes outside test files, then runs typecheck, the full suites, Prettier and repeated shuffled runs of your test files. It must print `verify: ok`. If it is blocked, fix the listed reasons and run it again.

## 3. Does each test check the change?

In pull request mode `.test-agent/verify.json` lists, per test file, which tests fail on the code before the change. Tests written for new or changed behavior should fail there. If all of them pass on the old code, they only execute the change: strengthen the assertions (exact values, calls, rendered text) and verify again. Tests for unchanged behavior may pass on both.

## 4. Quality check before you finish

- One behavior per test, named after the behavior.
- Assert outcomes users or callers see (return values, responses, rendered text, calls to collaborators), not private details.
- Cover edge and error paths that the source handles: empty input, boundaries, rejected promises, non-OK responses.
- No duplicates of existing tests, no `any`, no commented-out code, no `.only` or `.skip`.
