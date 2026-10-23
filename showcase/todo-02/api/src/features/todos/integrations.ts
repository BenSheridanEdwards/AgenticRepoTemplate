import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

// The todos live in memory for the life of the api process.
const todos = new Map<Todo['id'], Todo>();

export function newTodoId(): Todo['id'] {
  return randomUUID();
}

export function readTodos(): readonly Todo[] {
  return [...todos.values()];
}

export function readTodo(id: Todo['id']): Todo | undefined {
  return todos.get(id);
}

export function writeTodo(todo: Todo): void {
  todos.set(todo.id, todo);
}

export function removeTodo(id: Todo['id']): boolean {
  return todos.delete(id);
}
