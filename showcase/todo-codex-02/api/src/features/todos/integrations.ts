import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

const todos = new Map<string, Todo>();

export function nextTodoId(): string {
  return randomUUID();
}

export function listStoredTodos(): Todo[] {
  return Array.from(todos.values());
}

export function findStoredTodo(id: string): Todo | undefined {
  return todos.get(id);
}

export function saveTodo(todo: Todo): void {
  todos.set(todo.id, todo);
}

export function deleteStoredTodo(id: string): void {
  todos.delete(id);
}
