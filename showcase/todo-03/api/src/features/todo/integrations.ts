import { randomUUID } from 'node:crypto';
import { newTodo, type Todo, toggleCompletion } from './domain.ts';

// The todos live in memory, inside this api process, for the life of the server.
const store = new Map<string, Todo>();

export function allTodos(): readonly Todo[] {
  return [...store.values()];
}

export function insertTodo(title: string): Todo {
  const todo = newTodo(randomUUID(), title);
  store.set(todo.id, todo);
  return todo;
}

export function toggleStoredTodo(id: string): Todo | undefined {
  const todo = store.get(id);
  if (!todo) {
    return undefined;
  }
  const toggled = toggleCompletion(todo);
  store.set(id, toggled);
  return toggled;
}

export function deleteStoredTodo(id: string): boolean {
  return store.delete(id);
}
