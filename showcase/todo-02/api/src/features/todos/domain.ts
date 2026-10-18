export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

/** A new todo starts not complete. */
export function newTodo(id: string, title: string): Todo {
  return { id, title, completed: false };
}

export function toggled(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}
