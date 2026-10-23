import { newTodo, type Todo, toggleCompleted } from './domain.ts';
import { findTodo, newTodoId, readTodos, removeTodo, saveTodo } from './integrations.ts';

/** No todo has the id a request named. */
export class TodoNotFoundError extends Error {
  constructor(id: string) {
    super(`No todo has the id ${id}`);
    this.name = 'TodoNotFoundError';
  }
}

export interface CreateTodoRequest {
  readonly title: string;
}

export interface TodoRequest {
  readonly id: string;
}

export function listTodos(): readonly Todo[] {
  return readTodos();
}

export function createTodo(request: CreateTodoRequest): Todo {
  const todo = newTodo(newTodoId(), request.title);
  saveTodo(todo);
  return todo;
}

export function toggleTodo(request: TodoRequest): Todo {
  const todo = findTodo(request.id);
  if (!todo) {
    throw new TodoNotFoundError(request.id);
  }
  const toggled = toggleCompleted(todo);
  saveTodo(toggled);
  return toggled;
}

export function deleteTodo(request: TodoRequest): Todo {
  const todo = removeTodo(request.id);
  if (!todo) {
    throw new TodoNotFoundError(request.id);
  }
  return todo;
}
