import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDuplicateTodoMutation } from './useDuplicateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
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

const copy = { ...todoFixture, id: 8, title: 'Prepare a demo (copy)' }

it('puts the copy at the top of the cached list', async () => {
  const { client, wrapper } = setup()
  const other = { ...todoFixture, id: 1, title: 'Other' }
  client.setQueryData(todoKeys.list, [other, todoFixture])
  vi.mocked(todosApi.duplicate).mockResolvedValue(copy)
  const { result } = renderHook(() => useDuplicateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(todosApi.duplicate).toHaveBeenCalledWith(todoFixture.id)
  expect(client.getQueryData(todoKeys.list)).toEqual([copy, other, todoFixture])
})

it('does not list the copy twice when it is already cached', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture, copy])
  vi.mocked(todosApi.duplicate).mockResolvedValue(copy)
  const { result } = renderHook(() => useDuplicateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(client.getQueryData(todoKeys.list)).toEqual([copy, todoFixture])
})

it('starts a list with the copy when none was loaded', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.duplicate).mockResolvedValue(copy)
  const { result } = renderHook(() => useDuplicateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(client.getQueryData(todoKeys.list)).toEqual([copy])
})

it('keeps the cached list and exposes the error when duplicating fails', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.duplicate).mockRejectedValue(
    new Error('Could not duplicate.'),
  )
  const { result } = renderHook(() => useDuplicateTodoMutation(), { wrapper })
  await act(async () => {
    await expect(result.current.mutateAsync(todoFixture.id)).rejects.toThrow(
      'Could not duplicate.',
    )
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
  await waitFor(() =>
    expect(result.current.error?.message).toBe('Could not duplicate.'),
  )
})
