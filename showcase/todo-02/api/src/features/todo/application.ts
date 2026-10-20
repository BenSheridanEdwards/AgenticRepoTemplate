import type { Todo } from './domain.ts';
import { allTodos, dropTodo, flipTodo, storeTodo } from './integrations.ts';

export interface CreateTodoRequest {
  readonly title: string;
}

export interface ToggleTodoRequest {
  readonly id: string;
}

export interface RemoveTodoRequest {
  readonly id: string;
}

export function listTodos(): readonly Todo[] {
  return allTodos();
}

export function createTodo(request: CreateTodoRequest): Todo {
  return storeTodo(request.title);
}

export function toggleTodo(request: ToggleTodoRequest): readonly Todo[] {
  flipTodo(request.id);
  return allTodos();
}

export function removeTodo(request: RemoveTodoRequest): readonly Todo[] {
  dropTodo(request.id);
  return allTodos();
}
