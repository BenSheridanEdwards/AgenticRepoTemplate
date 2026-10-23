import { Button } from '@repo/ui';
import type { Todo } from './useTodos';

export interface TodoItemProps {
  readonly todo: Todo;
  readonly onToggle: (id: Todo['id']) => void;
  readonly onDelete: (id: Todo['id']) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  return (
    <li className="todo-item">
      <label className="todo-item__label">
        <input type="checkbox" checked={todo.completed} onChange={() => onToggle(todo.id)} />
        <span className={todo.completed ? 'todo-item__title--completed' : undefined}>
          {todo.title}
        </span>
      </label>
      <Button aria-label={`Delete ${todo.title}`} onClick={() => onDelete(todo.id)}>
        Delete
      </Button>
    </li>
  );
}
