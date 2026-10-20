import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

// The todos live in this Map for the life of the api process, so a page reload
// finds them again while the server runs.
const store = new Map<string, Todo>();

export function nextId(): string {
  return randomUUID();
}

export function allTodos(): readonly Todo[] {
  return [...store.values()];
}

export function findTodo(id: string): Todo | undefined {
  return store.get(id);
}

export function saveTodo(todo: Todo): void {
  store.set(todo.id, todo);
}

export function deleteTodo(id: string): boolean {
  return store.delete(id);
}
