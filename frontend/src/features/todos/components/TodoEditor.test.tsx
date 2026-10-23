import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: ({
    onSubmit,
  }: {
    onSubmit: (input: TodoInput) => Promise<void>
  }) => <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>,
}))

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn()
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})

function mockMutations({
  create = vi.fn(),
  update = vi.fn(),
  updateState = {},
}: {
  create?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  updateState?: Record<string, unknown>
} = {}) {
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
    ...updateState,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
}

it('updates an existing task and reports the saved changes', async () => {
  const user = userEvent.setup()
  const create = vi.fn()
  const update = vi.fn().mockResolvedValue(todoFixture)
  mockMutations({ create, update })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: todoFixture,
  })
  expect(create).not.toHaveBeenCalled()
})

it('does not report a save when the mutation fails', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockRejectedValue(new Error('Server error'))
  mockMutations({ create })
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(onSaved).not.toHaveBeenCalled()
})

it('ignores submissions while a change is already in progress', async () => {
  const user = userEvent.setup()
  const create = vi.fn()
  mockMutations({ create })
  const onSaved = vi.fn()
  render(<TodoEditor todo="new" busy onClose={vi.fn()} onSaved={onSaved} />)
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it('ignores submissions while its own mutation is pending', async () => {
  const user = userEvent.setup()
  const update = vi.fn()
  mockMutations({ update, updateState: { isPending: true } })
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(update).not.toHaveBeenCalled()
})
