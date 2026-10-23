export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}
export function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) throw new Error('Enter a title');
  return normalized;
}
export function toggleTodo(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}
