import type { Todo } from './domain.ts';
import { allTodos, deleteStoredTodo, insertTodo, toggleStoredTodo } from './integrations.ts';

export interface CreateTodoRequest {
  readonly title: string;
}

export interface TodoIdRequest {
  readonly id: string;
}

export function listTodos(): readonly Todo[] {
  return allTodos();
}

export function createTodo(request: CreateTodoRequest): Todo {
  return insertTodo(request.title);
}

export function toggleTodo(request: TodoIdRequest): Todo | undefined {
  return toggleStoredTodo(request.id);
}

export function deleteTodo(request: TodoIdRequest): boolean {
  return deleteStoredTodo(request.id);
}
