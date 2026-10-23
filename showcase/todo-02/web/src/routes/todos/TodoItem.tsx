import { Button } from '@repo/ui';
import type { Todo } from './useTodos';

export interface TodoItemProps {
  readonly todo: Todo;
  readonly onToggle: (id: Todo['id']) => void;
  readonly onDelete: (id: Todo['id']) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  const handleToggle = () => onToggle(todo.id);
  const handleDelete = () => onDelete(todo.id);

  return (
    <li className="todo-item">
      <label className="todo-item__label">
        <input type="checkbox" checked={todo.completed} onChange={handleToggle} />
        <span className={todo.completed ? 'todo-item__title--done' : undefined}>{todo.title}</span>
      </label>
      <Button aria-label={`Delete ${todo.title}`} onClick={handleDelete}>
        Delete
      </Button>
    </li>
  );
}
