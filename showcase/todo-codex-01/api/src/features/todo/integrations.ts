import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

const todos = new Map<string, Todo>();
export function nextId(): string {
  return randomUUID();
}
export function readTodos(): Todo[] {
  return [...todos.values()];
}
export function readTodo(id: string): Todo | undefined {
  return todos.get(id);
}
export function saveTodo(todo: Todo): void {
  todos.set(todo.id, todo);
}
export function removeTodo(id: string): void {
  todos.delete(id);
}
