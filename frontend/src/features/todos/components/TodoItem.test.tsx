import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it('offers duplicating only when a handler is provided', async () => {
  const user = userEvent.setup()
  const onDuplicate = vi.fn()
  const props = {
    todo: todoFixture,
    busy: false,
    onEdit: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
  }
  const { rerender } = render(<TodoItem {...props} />)
  expect(
    screen.queryByRole('button', { name: `Duplicate: ${todoFixture.title}` }),
  ).not.toBeInTheDocument()
  rerender(<TodoItem {...props} onDuplicate={onDuplicate} />)
  await user.click(
    screen.getByRole('button', { name: `Duplicate: ${todoFixture.title}` }),
  )
  expect(onDuplicate).toHaveBeenCalledTimes(1)
  expect(props.onEdit).not.toHaveBeenCalled()
  expect(props.onDelete).not.toHaveBeenCalled()
})

it('disables duplicating while another change is in progress', () => {
  render(
    <TodoItem
      todo={todoFixture}
      busy
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
    />,
  )
  expect(
    screen.getByRole('button', { name: `Duplicate: ${todoFixture.title}` }),
  ).toBeDisabled()
})

function renderItem(todo: Todo) {
  return render(
    <TodoItem
      todo={todo}
      busy={false}
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
}

it('shows the description only when the task has one', () => {
  const { unmount } = renderItem(todoFixture)
  expect(screen.queryByText('Bring the slides')).not.toBeInTheDocument()
  unmount()
  renderItem({ ...todoFixture, description: 'Bring the slides' })
  expect(screen.getByText('Bring the slides')).toBeVisible()
})

it('shows a completed task that can be marked as active again', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  render(
    <TodoItem
      todo={{ ...todoFixture, completed: true }}
      busy={false}
      onEdit={vi.fn()}
      onToggle={onToggle}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.queryByText('To do')).not.toBeInTheDocument()
  const checkbox = screen.getByRole('checkbox', {
    name: `Mark as active: ${todoFixture.title}`,
  })
  expect(checkbox).toBeChecked()
  await user.click(checkbox)
  expect(onToggle).toHaveBeenCalledTimes(1)
})

it('labels the checkbox of an active task as completing it', () => {
  renderItem(todoFixture)
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).not.toBeChecked()
})

describe('due date', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
  })
  afterEach(() => vi.useRealTimers())

  it('shows no date badge without a due date', () => {
    renderItem(todoFixture)
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument()
  })

  it('shows an upcoming due date without the overdue marker', () => {
    renderItem({ ...todoFixture, due_date: '2026-10-20' })
    expect(screen.getByText('20 Oct 2026')).toBeVisible()
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  })

  it('marks an open task past its due date as overdue', () => {
    renderItem({ ...todoFixture, due_date: '2026-10-10' })
    expect(screen.getByText(/10 Oct 2026/)).toHaveTextContent(
      '10 Oct 2026 · overdue',
    )
  })

  it('does not mark a completed task past its due date as overdue', () => {
    renderItem({ ...todoFixture, completed: true, due_date: '2026-10-10' })
    expect(screen.getByText('10 Oct 2026')).toBeVisible()
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  })
})
