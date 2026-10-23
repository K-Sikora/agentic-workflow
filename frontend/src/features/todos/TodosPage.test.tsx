import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { useDuplicateTodoMutation } from './hooks/useDuplicateTodoMutation'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { todoFixture } from '../../test/todoFixture'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useDuplicateTodoMutation', () => ({
  useDuplicateTodoMutation: vi.fn(),
}))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({
    disabled,
    onCreate,
  }: {
    disabled: boolean
    onCreate: () => void
  }) => (
    <>
      <h1>Tasks</h1>
      <button disabled={disabled} onClick={onCreate}>
        New task
      </button>
    </>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    todos,
    busy,
    loading,
    failed,
    hasTodos,
    onCreate,
    onToggle,
    onEdit,
    onDelete,
    onDuplicate,
  }: {
    todos: Todo[]
    busy: boolean
    loading: boolean
    failed: boolean
    hasTodos: boolean
    onCreate: () => void
    onToggle: (todo: Todo) => void
    onEdit: (todo: Todo) => void
    onDelete: (todo: Todo) => void
    onDuplicate: (todo: Todo) => void
  }) => (
    <>
      <p>Task list</p>
      <p>{`loading=${loading} failed=${failed} hasTodos=${hasTodos} busy=${busy}`}</p>
      <button onClick={onCreate}>Create from list</button>
      {todos.map((todo) => (
        <div key={todo.id}>
          <button onClick={() => onToggle(todo)}>Toggle {todo.title}</button>
          <button onClick={() => onEdit(todo)}>Edit {todo.title}</button>
          <button onClick={() => onDelete(todo)}>Delete {todo.title}</button>
          <button onClick={() => onDuplicate(todo)}>
            Duplicate {todo.title}
          </button>
        </div>
      ))}
    </>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onClose,
    onSaved,
  }: {
    todo: Todo | 'new'
    onClose: () => void
    onSaved: (message: string) => void
  }) => (
    <div
      role="dialog"
      aria-label={todo === 'new' ? 'Editor: new' : `Editor: ${todo.title}`}
    >
      <button onClick={onClose}>Close editor</button>
      <button onClick={() => onSaved('Changes saved.')}>Save editor</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    todo,
    onClose,
    onDeleted,
  }: {
    todo: Todo
    onClose: () => void
    onDeleted: () => void
  }) => (
    <div role="dialog" aria-label={`Deleting: ${todo.title}`}>
      <button onClick={onClose}>Close delete</button>
      <button onClick={onDeleted}>Confirm delete</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

function mockDuplicate({
  mutateAsync = vi.fn(),
  error = null as Error | null,
  reset = vi.fn(),
} = {}) {
  vi.mocked(useDuplicateTodoMutation).mockReturnValue({
    error,
    reset,
    mutateAsync,
  } as unknown as ReturnType<typeof useDuplicateTodoMutation>)
}

beforeEach(() => mockDuplicate())

function setup({
  todos = [] as Todo[],
  busy = false,
  mutateAsync = vi.fn(),
  mutationError = null as Error | null,
  query = {} as Record<string, unknown>,
} = {}) {
  const notify = vi.fn()
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: todos,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...query,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: mutationError,
    reset,
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: todos,
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  return { notify, reset, user: userEvent.setup() }
}

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('toggles a task and announces completion', async () => {
  const mutateAsync = vi
    .fn()
    .mockResolvedValue({ ...todoFixture, completed: true })
  const { notify, user } = setup({ todos: [todoFixture], mutateAsync })
  await user.click(
    screen.getByRole('button', { name: 'Toggle Prepare a demo' }),
  )
  expect(mutateAsync).toHaveBeenCalledWith({
    id: 7,
    input: { completed: true },
  })
  expect(notify).toHaveBeenCalledWith('Another task complete. Well done!')
})

it('marks a completed task as active again', async () => {
  const done = { ...todoFixture, completed: true }
  const mutateAsync = vi.fn().mockResolvedValue({ ...done, completed: false })
  const { notify, user } = setup({ todos: [done], mutateAsync })
  await user.click(
    screen.getByRole('button', { name: 'Toggle Prepare a demo' }),
  )
  expect(mutateAsync).toHaveBeenCalledWith({
    id: 7,
    input: { completed: false },
  })
  expect(notify).toHaveBeenCalledWith('Task marked as active.')
})

it('does not toggle a task while another change is in progress', async () => {
  const mutateAsync = vi.fn()
  const { notify, user } = setup({
    todos: [todoFixture],
    busy: true,
    mutateAsync,
  })
  await user.click(
    screen.getByRole('button', { name: 'Toggle Prepare a demo' }),
  )
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('stays silent when toggling fails and shows the mutation error', async () => {
  const mutateAsync = vi.fn().mockRejectedValue(new Error('Could not save.'))
  const { notify, user } = setup({
    todos: [todoFixture],
    mutateAsync,
    mutationError: new Error('Could not save.'),
  })
  await user.click(
    screen.getByRole('button', { name: 'Toggle Prepare a demo' }),
  )
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(notify).not.toHaveBeenCalled()
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not save.')
})

it('prefers the mutation error over the query error', () => {
  setup({
    mutationError: new Error('Mutation failed.'),
    query: { isError: true, error: new Error('Query failed.') },
  })
  expect(screen.getByTestId('alert')).toHaveTextContent('Mutation failed.')
})

it('duplicates a task and announces it', async () => {
  const mutateAsync = vi.fn().mockResolvedValue({ ...todoFixture, id: 8 })
  mockDuplicate({ mutateAsync })
  const { notify, user } = setup({ todos: [todoFixture] })
  await user.click(
    screen.getByRole('button', { name: 'Duplicate Prepare a demo' }),
  )
  expect(mutateAsync).toHaveBeenCalledWith(7)
  expect(notify).toHaveBeenCalledWith('Task duplicated.')
})

it('does not duplicate a task while another change is in progress', async () => {
  const mutateAsync = vi.fn()
  mockDuplicate({ mutateAsync })
  const { notify, user } = setup({ todos: [todoFixture], busy: true })
  await user.click(
    screen.getByRole('button', { name: 'Duplicate Prepare a demo' }),
  )
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('stays silent when duplicating fails and shows the mutation error', async () => {
  const error = new Error('Could not duplicate.')
  const mutateAsync = vi.fn().mockRejectedValue(error)
  mockDuplicate({ mutateAsync, error })
  const { notify, user } = setup({ todos: [todoFixture] })
  await user.click(
    screen.getByRole('button', { name: 'Duplicate Prepare a demo' }),
  )
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(notify).not.toHaveBeenCalled()
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not duplicate.')
})

it('prefers the duplicate error over the query error', () => {
  mockDuplicate({ error: new Error('Duplicate failed.') })
  setup({
    query: { isError: true, error: new Error('Query failed.') },
  })
  expect(screen.getByTestId('alert')).toHaveTextContent('Duplicate failed.')
})

it('resets the duplicate error before retrying', async () => {
  const reset = vi.fn()
  const refetch = vi.fn().mockResolvedValue(undefined)
  mockDuplicate({ reset, error: new Error('Duplicate failed.') })
  const { user } = setup({ query: { refetch } })
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
})

it('shows no alert and disables creating while the list is loading', () => {
  setup({ todos: [todoFixture], query: { isPending: true } })
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  expect(
    screen.getByText(/loading=true failed=false hasTodos=true/),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
})

it('disables retrying while the query is fetching', () => {
  setup({
    query: { isFetching: true, isError: true, error: new Error('Down.') },
  })
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('opens the editor for a new task from the header and the list', async () => {
  const { user } = setup({ todos: [todoFixture] })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'New task' }))
  expect(screen.getByRole('dialog', { name: 'Editor: new' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close editor' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Create from list' }))
  expect(screen.getByRole('dialog', { name: 'Editor: new' })).toBeVisible()
})

it('edits a task and closes the editor with a notice after saving', async () => {
  const { notify, user } = setup({ todos: [todoFixture] })
  await user.click(screen.getByRole('button', { name: 'Edit Prepare a demo' }))
  expect(
    screen.getByRole('dialog', { name: 'Editor: Prepare a demo' }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Save editor' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Changes saved.')
})

it('confirms deleting a task, closes the dialog and announces it', async () => {
  const { notify, user } = setup({ todos: [todoFixture] })
  await user.click(
    screen.getByRole('button', { name: 'Delete Prepare a demo' }),
  )
  expect(
    screen.getByRole('dialog', { name: 'Deleting: Prepare a demo' }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task deleted.')
})

it('closes the delete dialog without announcing anything', async () => {
  const { notify, user } = setup({ todos: [todoFixture] })
  await user.click(
    screen.getByRole('button', { name: 'Delete Prepare a demo' }),
  )
  await user.click(screen.getByRole('button', { name: 'Close delete' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
