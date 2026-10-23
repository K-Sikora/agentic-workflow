import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

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

it('removes only the deleted task from the cached list', async () => {
  const { client, wrapper } = setup()
  const other = { ...todoFixture, id: 1, title: 'Other' }
  client.setQueryData(todoKeys.list, [other, todoFixture])
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(todosApi.remove).toHaveBeenCalledWith(todoFixture.id)
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})

it('does not create a list in the cache when none was loaded', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the task in the cache and exposes the error when deletion fails', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Could not delete.'))
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(async () => {
    await expect(result.current.mutateAsync(todoFixture.id)).rejects.toThrow(
      'Could not delete.',
    )
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
  await waitFor(() =>
    expect(result.current.error?.message).toBe('Could not delete.'),
  )
})
