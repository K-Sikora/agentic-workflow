import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const done: Todo = {
  ...todoFixture,
  id: 8,
  title: 'Send invoice',
  completed: true,
}
const open: Todo = { ...todoFixture, id: 9, title: 'Book venue' }
const todos = [todoFixture, done, open]

it('starts with all tasks, no search and the newest first', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible.map((todo) => todo.id)).toEqual([9, 8, 7])
})

it('narrows the visible tasks when the status filter changes', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.filter).toBe('completed')
  expect(result.current.visible).toEqual([done])
  act(() => result.current.setFilter('active'))
  expect(result.current.visible.map((todo) => todo.id)).toEqual([9, 7])
})

it('narrows the visible tasks by search text', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSearch('INVOICE'))
  expect(result.current.search).toBe('INVOICE')
  expect(result.current.visible).toEqual([done])
})

it('reorders the visible tasks when the sort changes', () => {
  const high: Todo = { ...open, priority: 'high' }
  const { result } = renderHook(() => useTodoFilters([todoFixture, done, high]))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible.map((todo) => todo.id)).toEqual([9, 8, 7])
  act(() => result.current.setSort('due'))
  expect(result.current.sort).toBe('due')
})

it('reflects a changed task list', () => {
  const { result, rerender } = renderHook(({ list }) => useTodoFilters(list), {
    initialProps: { list: [todoFixture] },
  })
  expect(result.current.visible).toEqual([todoFixture])
  rerender({ list: [todoFixture, open] })
  expect(result.current.visible.map((todo) => todo.id)).toEqual([9, 7])
})
