import { TodoItem } from './TodoItem';
import type { Todo } from './useTodos';

export interface TodoListProps {
  readonly todos: readonly Todo[];
  readonly onToggle: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

export function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
  return (
    <ul className="todo-list" aria-label="Todos">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </ul>
  );
}
