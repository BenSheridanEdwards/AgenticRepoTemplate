import { TodoItem } from './TodoItem';
import type { TodosState } from './useTodos';

export interface TodoListProps {
  readonly todos: TodosState;
  readonly onToggle: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

export function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
  if (todos.status === 'loading') {
    return <output className="todos-note">Loading…</output>;
  }
  if (todos.status === 'error') {
    return (
      <p role="alert" className="todos-error">
        Could not load the todos
      </p>
    );
  }
  if (todos.todos.length === 0) {
    return <p className="todos-note">No todos yet</p>;
  }
  return (
    <ul className="todo-list" aria-label="Todos">
      {todos.todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </ul>
  );
}
