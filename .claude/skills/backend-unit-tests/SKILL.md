---
name: backend-unit-tests
description: Conventions and recipes for unit tests of the Taskly backend (Node.js, Express 5, Prisma 7, Zod, Vitest). Use when writing or updating any test under backend/tests.
---

# Backend unit tests

## Layout and style

- Tests live flat in `backend/tests/<module>.test.ts`, for example `tests/router.test.ts` for `src/features/todos/router.ts`.
- Import sources with the `.ts` extension: `import { createApp } from '../src/factory.ts';`
- `import { afterEach, describe, it, expect, vi } from 'vitest';` and top-level `it('describes the behavior', ...)`. Use `it.each` for input tables, as `validators.test.ts` does.
- Shared data is in `tests/fixture.ts`: `record` is a database row, `todo` is the API shape. Extend it with spreads (`{ ...todo, completed: true }`) instead of new literals.
- Restore spies after each test: `afterEach(() => vi.restoreAllMocks());`
- No real database or network. Tests must pass without PostgreSQL or a `.env` file.

## Prisma

Build the real client without connecting, then stub the delegate method:

```ts
const database = createDatabase('postgresql://test:test@localhost:5432/test');
const findMany = vi.spyOn(database.todo, 'findMany').mockResolvedValue([record]);
```

For raw SQL or connection methods spy on `database.$executeRaw`, `$connect` or `$disconnect`. For small units a fake is enough: `{ todo: { findFirst: vi.fn() } } as unknown as Database`.

## HTTP

Use `supertest` against an Express app:

- Router level, as in `router.test.ts`: mount `createTodosRouter(repository)` with a fake repository of `vi.fn()` methods.
- App level: `createApp(fakeDatabase)` covers `/api/health`, the 404 JSON body, invalid JSON (422 `Invalid JSON.`), oversized bodies (413) and the 500 handler. Silence expected error logs with `vi.spyOn(console, 'error').mockImplementation(() => {})` and assert they were called.
- Assert status, body and the repository calls. For 422 responses assert that the repository was not called.

## Environment and process code

- `src/core/config.ts` reads `process.env` and loads `../../.env` on import. Use `vi.stubEnv(name, value)` for every variable the case needs, `vi.stubEnv('DATABASE_URL', '')` to exercise the component path, and `vi.unstubAllEnvs()` in `afterEach`.
- `src/core/lifespan.ts`: mock collaborators with `vi.mock('../src/core/database.ts', ...)`, `vi.mock('../src/core/config.ts', ...)` and `vi.mock('../src/factory.ts', ...)`. Return an app whose `listen` calls back with a fake server (`address()`, `close(cb)`, `once()`), spy on `process.once` to capture the shutdown handler, and use fake timers for the exit timeout. Cover the failure path: `$disconnect` is called and the error is rethrown.

## Thresholds

`vitest.config.ts` requires 100% coverage for `validators.ts` and `mappers.ts`. Changes to those files need full branch coverage.

## Run

```
npm --prefix backend test -- tests/<file>.test.ts
npm --prefix backend run typecheck
```
