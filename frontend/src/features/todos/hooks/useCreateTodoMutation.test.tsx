import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { TodoInput } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const input: TodoInput = {
  title: todoFixture.title,
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

it('creates the list with the saved task when nothing is cached', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(input))
  expect(todosApi.create).toHaveBeenCalledWith(input)
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('puts the saved task first in the cached list', async () => {
  const { client, wrapper } = setup()
  const existing = { ...todoFixture, id: 1, title: 'Existing' }
  client.setQueryData(todoKeys.list, [existing])
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(input))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture, existing])
})

it('does not duplicate a task that is already cached', async () => {
  const { client, wrapper } = setup()
  const stale = { ...todoFixture, title: 'Stale copy' }
  const other = { ...todoFixture, id: 1, title: 'Other' }
  client.setQueryData(todoKeys.list, [other, stale])
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(input))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture, other])
})

it('keeps the cache unchanged and exposes the error when creation fails', async () => {
  const { client, wrapper } = setup()
  const existing = { ...todoFixture, id: 1 }
  client.setQueryData(todoKeys.list, [existing])
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Could not save.'))
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(async () => {
    await expect(result.current.mutateAsync(input)).rejects.toThrow(
      'Could not save.',
    )
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([existing])
  await waitFor(() =>
    expect(result.current.error?.message).toBe('Could not save.'),
  )
})
