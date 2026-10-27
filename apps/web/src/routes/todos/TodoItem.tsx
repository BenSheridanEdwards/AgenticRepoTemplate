import { Button } from '@repo/ui';
import type { RouterOutputs } from '../../api-client';

type Todo = RouterOutputs['todos']['list'][number];

interface TodoItemProps {
  readonly todo: Todo;
  readonly disabled: boolean;
  readonly onToggle: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

export function TodoItem({ todo, disabled, onToggle, onDelete }: TodoItemProps) {
  return (
    <li className="todos-item">
      <label className="todos-label">
        <input
          type="checkbox"
          checked={todo.completed}
          disabled={disabled}
          onChange={() => onToggle(todo.id)}
        />
        <span className={todo.completed ? 'todos-completed' : undefined}>{todo.title}</span>
      </label>
      <Button
        disabled={disabled}
        aria-label={`Delete ${todo.title}`}
        onClick={() => onDelete(todo.id)}
      >
        Delete
      </Button>
    </li>
  );
}
