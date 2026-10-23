export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}
export function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error('Enter a title');
  }
  return trimmed;
}
export function toggleTodo(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}
