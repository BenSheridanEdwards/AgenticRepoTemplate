import { Button } from '@repo/ui';
import type { RouterOutputs } from '../../api-client';

type Todo = RouterOutputs['todos']['list'][number];

export interface TodoItemProps {
  readonly todo: Todo;
  readonly onToggle: (id: Todo['id']) => void;
  readonly onDelete: (id: Todo['id']) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  function handleToggle() {
    onToggle(todo.id);
  }

  function handleDelete() {
    onDelete(todo.id);
  }

  return (
    <li className="todo-item">
      <label className="todo-item__label">
        <input type="checkbox" checked={todo.completed} onChange={handleToggle} />
        {todo.title}
      </label>
      <Button aria-label={`Delete ${todo.title}`} onClick={handleDelete}>
        Delete
      </Button>
    </li>
  );
}
