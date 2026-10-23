import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from './todos'

vi.mock('../../../lib/http', () => ({ request: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('passes the abort signal when fetching tasks', async () => {
  const signal = new AbortController().signal
  vi.mocked(request).mockResolvedValue([todoFixture])
  await expect(todosApi.list(signal)).resolves.toEqual([todoFixture])
  expect(request).toHaveBeenCalledWith('/todos', { signal })
})

it('sends only writable task fields on creation', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await expect(todosApi.create(todoFixture)).resolves.toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos', {
    method: 'POST',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: false,
    }),
  })
})

it('patches a task by id with only the writable fields', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await expect(
    todosApi.update(7, { title: 'Renamed', completed: true }),
  ).resolves.toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos/7', {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Renamed', completed: true }),
  })
})

it('does not send read-only fields when updating with a full task', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await todosApi.update(7, todoFixture)
  const body = JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string)
  expect(Object.keys(body).sort()).toEqual([
    'completed',
    'description',
    'due_date',
    'priority',
    'title',
  ])
})

it('duplicates a task by id with a POST', async () => {
  const copy = { ...todoFixture, id: 8, title: 'Prepare a demo (copy)' }
  vi.mocked(request).mockResolvedValue(copy)
  await expect(todosApi.duplicate(7)).resolves.toEqual(copy)
  expect(request).toHaveBeenCalledWith('/todos/7/duplicate', { method: 'POST' })
})

it('deletes a task by id', async () => {
  vi.mocked(request).mockResolvedValue(undefined)
  await expect(todosApi.remove(7)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledWith('/todos/7', { method: 'DELETE' })
})
