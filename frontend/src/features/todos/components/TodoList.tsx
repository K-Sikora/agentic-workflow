import { Card, Heading, Text } from '../../../design-system'
import type { Todo } from '../types'
import { TodoEmptyState } from './TodoEmptyState'
import { TodoItem } from './TodoItem'

interface TodoListProps {
  todos: Todo[]
  hasTodos: boolean
  loading: boolean
  failed: boolean
  busy: boolean
  onCreate: () => void
  onToggle: (todo: Todo) => void
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  onDuplicate?: (todo: Todo) => void
}

export function TodoList({
  todos,
  hasTodos,
  loading,
  failed,
  busy,
  onCreate,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
}: TodoListProps) {
  return (
    <section aria-label="Task list">
      {loading ? (
        <Card>
          <Text role="status">Loading your tasks…</Text>
        </Card>
      ) : failed && !hasTodos ? (
        <Card>
          <Heading level={3}>The task list is temporarily unavailable</Heading>
          <Text muted>Try again to load your tasks.</Text>
        </Card>
      ) : todos.length ? (
        <ul className="todo-list stack compact">
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              busy={busy}
              onToggle={() => onToggle(todo)}
              onEdit={() => onEdit(todo)}
              onDelete={() => onDelete(todo)}
              onDuplicate={onDuplicate && (() => onDuplicate(todo))}
            />
          ))}
        </ul>
      ) : (
        <TodoEmptyState
          hasTodos={hasTodos}
          disabled={busy}
          onCreate={onCreate}
        />
      )}
    </section>
  )
}
