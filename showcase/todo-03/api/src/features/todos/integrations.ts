import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

/** The todos, in memory inside the api process, in the order they were added. */
const todos = new Map<string, Todo>();

export function newTodoId(): string {
  return randomUUID();
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

export function removeTodo(id: string): boolean {
  return todos.delete(id);
}
