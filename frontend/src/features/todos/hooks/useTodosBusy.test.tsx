import {
  MutationObserver,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

function startMutation(
  client: QueryClient,
  mutationKey: readonly string[],
  mutationFn: () => Promise<unknown>,
) {
  const observer = new MutationObserver(client, { mutationKey, mutationFn })
  return observer.mutate()
}

it('is false when no task mutation is running', () => {
  const { wrapper } = setup()
  const { result } = renderHook(() => useTodosBusy(), { wrapper })
  expect(result.current).toBe(false)
})

it('is true while a task mutation is pending and false once it settles', async () => {
  const { client, wrapper } = setup()
  const { result } = renderHook(() => useTodosBusy(), { wrapper })
  let resolve!: () => void
  const pending = new Promise<void>((done) => {
    resolve = done
  })
  let mutation!: Promise<unknown>
  act(() => {
    mutation = startMutation(client, todoKeys.update, () => pending)
  })
  await waitFor(() => expect(result.current).toBe(true))
  await act(async () => {
    resolve()
    await mutation
  })
  await waitFor(() => expect(result.current).toBe(false))
})

it('ignores mutations that do not belong to tasks', async () => {
  const { client, wrapper } = setup()
  const { result } = renderHook(() => useTodosBusy(), { wrapper })
  let resolve!: () => void
  const pending = new Promise<void>((done) => {
    resolve = done
  })
  let mutation!: Promise<unknown>
  act(() => {
    mutation = startMutation(client, ['other', 'thing'], () => pending)
  })
  expect(result.current).toBe(false)
  await act(async () => {
    resolve()
    await mutation
  })
})
