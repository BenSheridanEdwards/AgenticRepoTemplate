export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}
export function createTodo(id: string, title: string): Todo {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error('Enter a title');
  }
  return { id, title: trimmed, completed: false };
}
export function toggleTodo(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}
