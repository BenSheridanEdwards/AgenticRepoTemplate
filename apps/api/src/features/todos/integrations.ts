import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

let todos: readonly Todo[] = [];

export function newTodoId(): string {
  return randomUUID();
}

export function readTodos(): readonly Todo[] {
  return todos;
}

export function writeTodos(nextTodos: readonly Todo[]): void {
  todos = nextTodos;
}
