import { TodoItem } from './TodoItem';
import type { Todo, TodosState } from './useTodos';

export interface TodoListProps {
  readonly todos: TodosState;
  readonly onToggle: (id: Todo['id']) => void;
  readonly onDelete: (id: Todo['id']) => void;
}

export function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
  if (todos.status === 'loading') {
    return <p className="todo-status">Loading…</p>;
  }
  if (todos.status === 'error') {
    return (
      <p role="alert" className="todo-error">
        Could not load the todos
      </p>
    );
  }
  if (todos.todos.length === 0) {
    return <p className="todo-status">No todos yet</p>;
  }
  return (
    <ul className="todo-list" aria-label="Todos">
      {todos.todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </ul>
  );
}
