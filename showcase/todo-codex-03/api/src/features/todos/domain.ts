export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export function toggleTodo(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}
