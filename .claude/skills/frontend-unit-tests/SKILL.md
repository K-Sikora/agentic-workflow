---
name: frontend-unit-tests
description: Conventions and recipes for unit tests of the Taskly frontend (React 19, TanStack Query 5, styled-components, Testing Library, Vitest with jsdom). Use when writing or updating any frontend test.
---

# Frontend unit tests

## Layout and style

- Tests sit next to the source: `TodoList.tsx` and `TodoList.test.tsx`. Use `.test.tsx` when the file contains JSX.
- Imports have no extensions. Vitest globals are off, so import them: `import { afterEach, expect, it, vi } from 'vitest'`.
- Top-level `it('describes what the user sees or gets', ...)`.
- Query by role and accessible name (`screen.getByRole('button', { name: 'Edit: Prepare a demo' })`), then text. Avoid test ids and class names.
- `userEvent.setup()` for interaction. jest-dom matchers (`toBeVisible`, `toBeChecked`) come from `src/test/setup.ts`.
- Shared data: `todoFixture` from `src/test/todoFixture.ts`; vary it with spreads.
- Prettier style: no semicolons, single quotes, trailing commas. Format every file you touch:
  `node frontend/node_modules/prettier/bin/prettier.cjs --write <file>`

## Design system

Components render through the design system. Replace it with the lightweight mocks, using the relative path from the test file:

```ts
vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
```

## Page-level components

For containers such as `TodosPage.tsx`, mock hooks and child components and drive them with `vi.mocked(hook).mockReturnValue(...)`, as `TodosPage.test.tsx` does.

## TanStack Query hooks

Render hooks with a fresh client per test and no retries, and mock the API module:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { todosApi } from '../api/todos'

vi.mock('../api/todos', () => ({
  todosApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
```

- Queries: `await waitFor(() => expect(result.current.isSuccess).toBe(true))`, then assert `data` and the API call (including the abort `signal`).
- Mutations: `await result.current.mutateAsync(input)` inside `act`, then assert the cache with `client.getQueryData(todoKeys.list)`. Seed it first with `client.setQueryData(todoKeys.list, [...])` to check ordering, replacement and removal.
- `useTodosBusy`: start a mutation with a key under `todoKeys.all` that never resolves and assert `true`, then `false` with no mutations.

## HTTP client

`src/lib/http.ts` calls `fetch('/api' + path)`. Stub it and restore it:

```ts
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => vi.unstubAllGlobals())
fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
```

Cover: JSON headers merged with custom ones, 204 returns `undefined`, 422 message, `detail` string from the body, the generic message, network failure, and rethrowing when the request was aborted.

## Run

```
npm --prefix frontend test -- src/<path>/<File>.test.tsx
npm --prefix frontend run typecheck
```
