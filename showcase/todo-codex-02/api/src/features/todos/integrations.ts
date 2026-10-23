import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

const todos = new Map<string, Todo>();
export function listTodos(): Todo[] {
  return [...todos.values()];
}
export function storeTodo(todo: Todo): Todo {
  todos.set(todo.id, todo);
  return todo;
}
export function newTodoId(): string {
  return randomUUID();
}
export function findTodo(id: string): Todo | undefined {
  return todos.get(id);
}
export function deleteTodo(id: string): void {
  todos.delete(id);
}
