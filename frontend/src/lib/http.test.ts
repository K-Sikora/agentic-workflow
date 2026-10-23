import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

it('prefixes the path with /api and returns the parsed JSON body', async () => {
  fetchMock.mockResolvedValue(jsonResponse([{ id: 1 }]))
  await expect(request('/todos')).resolves.toEqual([{ id: 1 }])
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    headers: { 'Content-Type': 'application/json' },
  })
})

it('merges custom headers over the JSON default and forwards the other options', async () => {
  fetchMock.mockResolvedValue(jsonResponse({}))
  await request('/todos', {
    method: 'POST',
    body: '{}',
    headers: { 'X-Test': '1', 'Content-Type': 'text/plain' },
  })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    body: '{}',
    headers: { 'X-Test': '1', 'Content-Type': 'text/plain' },
  })
})

it('returns undefined without reading a body for 204 responses', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  await expect(
    request('/todos/1', { method: 'DELETE' }),
  ).resolves.toBeUndefined()
})

it('explains the validation limits for a 422 response', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ detail: 'ignored' }, 422))
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('uses the detail string from the error body', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ detail: 'Task not found.' }, 404))
  await expect(request('/todos/9')).rejects.toThrow('Task not found.')
})

it('falls back to a generic message when detail is not a string', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ detail: [{ msg: 'bad' }] }, 400))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('falls back to a generic message when the error body is not JSON', async () => {
  fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('falls back to a generic message when the error body is JSON null', async () => {
  fetchMock.mockResolvedValue(new Response('null', { status: 500 }))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('reports a connection problem when the network request fails', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException('Aborted', 'AbortError')
  fetchMock.mockRejectedValue(abortError)
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})
