import type { Todo } from './domain.ts';

/** The todos, kept in memory for the life of the api process, in creation order. */
const todos = new Map<string, Todo>();
let lastId = 0;

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

/** True when a todo with this id was there to remove. */
export function removeTodo(id: string): boolean {
  return todos.delete(id);
}
