import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: ({
    hasTodos,
    disabled,
    onCreate,
  }: {
    hasTodos: boolean
    disabled: boolean
    onCreate: () => void
  }) => (
    <div>
      <p>Empty task list</p>
      <p>{hasTodos ? 'has tasks' : 'no tasks'}</p>
      <button disabled={disabled} onClick={onCreate}>
        Create from empty state
      </button>
    </div>
  ),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
    onDuplicate,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
    onDuplicate?: () => void
  }) => (
    <li>
      <span>{todo.title}</span>
      <button disabled={busy} onClick={onToggle}>
        Toggle {todo.title}
      </button>
      <button onClick={onEdit}>Edit {todo.title}</button>
      <button onClick={onDelete}>Delete {todo.title}</button>
      {onDuplicate && (
        <button onClick={onDuplicate}>Duplicate {todo.title}</button>
      )}
    </li>
  ),
}))

const baseProps = {
  todos: [] as Todo[],
  hasTodos: false,
  loading: false,
  failed: false,
  busy: false,
  onCreate: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

it('shows loading feedback before showing an empty list', () => {
  const props = {
    todos: [],
    hasTodos: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})

it('shows an unavailable message when loading failed and nothing is cached', () => {
  render(<TodoList {...baseProps} failed />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByText('Try again to load your tasks.')).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('keeps showing cached tasks when a refresh failed', () => {
  render(<TodoList {...baseProps} failed hasTodos todos={[todoFixture]} />)
  expect(screen.getByText(todoFixture.title)).toBeVisible()
  expect(
    screen.queryByText('The task list is temporarily unavailable'),
  ).not.toBeInTheDocument()
})

it('renders every task and forwards actions for the chosen task', async () => {
  const user = userEvent.setup()
  const second = { ...todoFixture, id: 8, title: 'Second task' }
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoList
      {...baseProps}
      hasTodos
      todos={[todoFixture, second]}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Toggle Second task' }))
  expect(onToggle).toHaveBeenCalledWith(second)
  await user.click(screen.getByRole('button', { name: 'Edit Prepare a demo' }))
  expect(onEdit).toHaveBeenCalledWith(todoFixture)
  await user.click(screen.getByRole('button', { name: 'Delete Second task' }))
  expect(onDelete).toHaveBeenCalledWith(second)
})

it('forwards duplicate requests for the chosen task only when handled', async () => {
  const user = userEvent.setup()
  const second = { ...todoFixture, id: 8, title: 'Second task' }
  const onDuplicate = vi.fn()
  const { rerender } = render(
    <TodoList {...baseProps} hasTodos todos={[todoFixture, second]} />,
  )
  expect(
    screen.queryByRole('button', { name: 'Duplicate Second task' }),
  ).not.toBeInTheDocument()
  rerender(
    <TodoList
      {...baseProps}
      hasTodos
      todos={[todoFixture, second]}
      onDuplicate={onDuplicate}
    />,
  )
  await user.click(
    screen.getByRole('button', { name: 'Duplicate Second task' }),
  )
  expect(onDuplicate).toHaveBeenCalledTimes(1)
  expect(onDuplicate).toHaveBeenCalledWith(second)
})

it('passes the busy state to the tasks', () => {
  render(<TodoList {...baseProps} hasTodos todos={[todoFixture]} busy />)
  expect(
    screen.getByRole('button', { name: 'Toggle Prepare a demo' }),
  ).toBeDisabled()
})

it('tells the empty state whether tasks exist, and forwards creation and busy state', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const { rerender } = render(
    <TodoList {...baseProps} hasTodos onCreate={onCreate} />,
  )
  expect(screen.getByText('has tasks')).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Create from empty state' }),
  )
  expect(onCreate).toHaveBeenCalledTimes(1)
  rerender(<TodoList {...baseProps} onCreate={onCreate} busy />)
  expect(screen.getByText('no tasks')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Create from empty state' }),
  ).toBeDisabled()
})
