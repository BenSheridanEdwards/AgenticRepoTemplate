import { TodoItem } from './TodoItem';
import type { TodosState } from './useTodos';

export interface TodoListProps {
  readonly todos: TodosState;
  readonly onToggle: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

export function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
  if (todos.status === 'loading') {
    return <output className="todos-empty">Loading…</output>;
  }
  if (todos.status === 'error') {
    return (
      <p role="alert" className="todos-error">
        Could not load the todos
      </p>
    );
  }
  return (
    <>
      <ul className="todo-list" aria-label="Todos">
        {todos.todos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
        ))}
      </ul>
      {todos.todos.length === 0 ? <p className="todos-empty">No todos yet.</p> : null}
    </>
  );
}
