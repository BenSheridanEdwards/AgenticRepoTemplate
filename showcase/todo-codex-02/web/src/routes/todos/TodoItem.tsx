import { Button } from '@repo/ui';
import type { RouterOutputs } from '../../api-client';

export interface TodoItemProps {
  readonly todo: RouterOutputs['todos']['list'][number];
  readonly pending: boolean;
  readonly onToggle: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

export function TodoItem({ todo, pending, onToggle, onDelete }: TodoItemProps) {
  return (
    <li className="todo-item">
      <label>
        <input
          type="checkbox"
          checked={todo.completed}
          disabled={pending}
          onChange={() => onToggle(todo.id)}
        />
        <span>{todo.title}</span>
      </label>
      <Button
        aria-label={`Delete ${todo.title}`}
        disabled={pending}
        onClick={() => onDelete(todo.id)}
      >
        Delete
      </Button>
    </li>
  );
}
