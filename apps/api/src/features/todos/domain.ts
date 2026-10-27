export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export function createTodo(id: string, title: string): Todo {
  return { id, title, completed: false };
}

export function toggleCompletion(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}
