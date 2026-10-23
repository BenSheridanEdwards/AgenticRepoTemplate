export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export function createTodo(id: string, title: string): Todo {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Enter a title');
  }
  return { id, title: trimmedTitle, completed: false };
}

export function toggleTodo(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}
