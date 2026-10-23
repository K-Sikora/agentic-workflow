import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatDate,
  isOverdue,
  priorityLabels,
  selectTodos,
  validateTodo,
} from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('shows only completed tasks for the completed filter', () => {
    const done = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('matches the search against the title as well', () => {
    const other = { ...base, id: 2, title: 'Groceries' }
    expect(selectTodos([base, other], 'all', 'GROCER', 'newest')).toEqual([
      other,
    ])
  })

  it('orders tasks of equal priority with the newest id first', () => {
    const newer = { ...base, id: 2 }
    expect(selectTodos([base, newer], 'all', '', 'priority')).toEqual([
      newer,
      base,
    ])
  })

  it('orders low priority after medium priority', () => {
    const low: Todo = { ...base, id: 2, priority: 'low' }
    expect(selectTodos([low, base], 'all', '', 'priority')).toEqual([base, low])
  })

  it('sorts by due date with undated tasks last and ties by newest id', () => {
    const undated = { ...base, id: 1 }
    const later = { ...base, id: 2, due_date: '2026-12-01' }
    const sooner = { ...base, id: 3, due_date: '2026-11-01' }
    const soonerTie = { ...base, id: 4, due_date: '2026-11-01' }
    expect(
      selectTodos([undated, later, sooner, soonerTie], 'all', '', 'due'),
    ).toEqual([soonerTie, sooner, later, undated])
  })

  it('sorts newest first by creation time, then by id', () => {
    const older = { ...base, id: 5, created_at: '2026-09-01T12:00:00Z' }
    const newer = { ...base, id: 2, created_at: '2026-10-02T12:00:00Z' }
    const sameTimeHigherId = { ...base, id: 9 }
    expect(
      selectTodos([older, base, newer, sameTimeHigherId], 'all', '', 'newest'),
    ).toEqual([newer, sameTimeHigherId, base, older])
  })
})

describe('validateTodo', () => {
  const valid: TodoInput = {
    title: 'Write tests',
    description: '',
    priority: 'medium',
    due_date: null,
    completed: false,
  }

  it('accepts a valid task', () => {
    expect(validateTodo(valid)).toEqual({})
    expect(validateTodo({ ...valid, due_date: '2026-02-28' })).toEqual({})
    expect(validateTodo({ ...valid, due_date: '2028-02-29' })).toEqual({})
  })

  it('requires a title that is not only whitespace', () => {
    expect(validateTodo({ ...valid, title: '   ' })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it('limits the trimmed title to 120 characters', () => {
    expect(validateTodo({ ...valid, title: 'a'.repeat(120) })).toEqual({})
    expect(validateTodo({ ...valid, title: ` ${'a'.repeat(120)} ` })).toEqual(
      {},
    )
    expect(validateTodo({ ...valid, title: 'a'.repeat(121) })).toEqual({
      title: 'The title must be at most 120 characters.',
    })
  })

  it('limits the trimmed description to 2000 characters', () => {
    expect(validateTodo({ ...valid, description: 'a'.repeat(2000) })).toEqual(
      {},
    )
    expect(validateTodo({ ...valid, description: 'a'.repeat(2001) })).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
  })

  it.each(['2026-02-30', '2026-13-01', '2026-2-3', 'tomorrow', '2026-02-28x'])(
    'rejects the invalid due date %s',
    (due_date) => {
      expect(validateTodo({ ...valid, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )

  it('rejects a leap day in a non-leap year', () => {
    expect(validateTodo({ ...valid, due_date: '2027-02-29' })).toEqual({
      due_date: 'Enter a valid date.',
    })
  })

  it('reports every problem at once', () => {
    expect(
      validateTodo({
        ...valid,
        title: '',
        description: 'a'.repeat(2001),
        due_date: 'nope',
      }),
    ).toEqual({
      title: 'Enter a task title.',
      description: 'The description must be at most 2000 characters.',
      due_date: 'Enter a valid date.',
    })
  })
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  function setToday() {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0))
  }

  it('is true for an open task due before today', () => {
    setToday()
    expect(isOverdue({ ...base, due_date: '2026-10-14' })).toBe(true)
  })

  it('is false for a task due today or later', () => {
    setToday()
    expect(isOverdue({ ...base, due_date: '2026-10-15' })).toBe(false)
    expect(isOverdue({ ...base, due_date: '2026-10-16' })).toBe(false)
  })

  it('is false for completed tasks and tasks without a due date', () => {
    setToday()
    expect(
      isOverdue({ ...base, due_date: '2026-10-01', completed: true }),
    ).toBe(false)
    expect(isOverdue({ ...base, due_date: null })).toBe(false)
  })

  it('compares against the local date with zero-padded month and day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 23, 30, 0))
    expect(isOverdue({ ...base, due_date: '2026-01-04' })).toBe(true)
    expect(isOverdue({ ...base, due_date: '2026-01-05' })).toBe(false)
  })
})

describe('formatDate', () => {
  it('formats an ISO date as day, short month and year in British English', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026')
  })
})

describe('priorityLabels', () => {
  it('labels every priority', () => {
    expect(priorityLabels).toEqual({
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    })
  })
})
