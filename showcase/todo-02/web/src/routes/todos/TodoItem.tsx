import { Button } from '@repo/ui';
import type { Todo } from './useTodos';

export interface TodoItemProps {
  readonly todo: Todo;
  readonly onToggle: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  const handleToggle = () => onToggle(todo.id);
  const handleDelete = () => onDelete(todo.id);

  return (
    <li className="todo-item">
      <label className="todo-item__label">
        <input
          type="checkbox"
          className="todo-item__checkbox"
          checked={todo.completed}
          onChange={handleToggle}
        />
        <span className="todo-item__title">{todo.title}</span>
      </label>
      <Button type="button" onClick={handleDelete}>
        {`Delete ${todo.title}`}
      </Button>
    </li>
  );
}
