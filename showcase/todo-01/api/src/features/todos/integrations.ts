import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

// The todos live in memory for the life of the api process.
const todos = new Map<string, Todo>();

export function nextTodoId(): string {
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

export function eraseTodo(id: string): void {
  todos.delete(id);
}
