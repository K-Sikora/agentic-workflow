import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
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
