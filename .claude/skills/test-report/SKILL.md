---
name: test-report
description: Write the final unit test report for a pull request comment or a coverage run. Use as the last step, after verification.
---

# Test report

Write Markdown in this shape and keep it under 60 lines:

```
## Unit test agent

<One sentence: what was added or updated and the verification verdict.>

### Decisions
| File | Decision | Reason |
|---|---|---|

### Tests
| Test file | Added | Updated | Fail on the code before the change |
|---|---|---|---|

### Suspected bugs
<Only if any. For each: file and line, expected vs actual behavior, and the failing test in a collapsed block.>

<details><summary>Verification</summary>

<Paste .test-agent/verify.md>

</details>
```

Rules:

- Every number comes from `verify.json` or a test run you made. Never estimate or round up.
- Use plain, short sentences. Name files and tests exactly.
- In `all` mode replace "Fail on the code before the change" with line and branch coverage before and after for each file you touched, measured with `npm --prefix <package> run test:coverage`.
- If nothing needed tests, say so in one sentence and list the skipped files with reasons.
