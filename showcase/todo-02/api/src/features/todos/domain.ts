export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export function createTodo(id: Todo['id'], title: Todo['title']): Todo {
  return { id, title, completed: false };
}

export function toggleTodo(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}
