import type { Todo } from './domain.ts';

const todos = new Map<string, Todo>();
let lastId = 0;

/** The next unused todo id, for the life of the api process. */
export function nextTodoId(): string {
  lastId += 1;
  return String(lastId);
}

export function readTodos(): readonly Todo[] {
  return [...todos.values()];
}

export function readTodo(id: string): Todo | undefined {
  return todos.get(id);
}

export function writeTodo(todo: Todo): void {
  todos.set(todo.id, todo);
}

export function removeTodo(id: string): void {
  todos.delete(id);
}
