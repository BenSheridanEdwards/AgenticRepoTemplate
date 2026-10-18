import { newTodo, type Todo, toggled } from './domain.ts';
import { nextTodoId, readTodo, readTodos, removeTodo, writeTodo } from './integrations.ts';

export interface CreateTodoRequest {
  readonly title: string;
}

export interface TodoRequest {
  readonly id: string;
}

/** A use case on a todo id that names no todo. */
export class TodoNotFoundError extends Error {
  constructor(id: string) {
    super(`No todo has the id ${id}`);
    this.name = 'TodoNotFoundError';
  }
}

export function listTodos(): readonly Todo[] {
  return readTodos();
}

export function createTodo(request: CreateTodoRequest): Todo {
  const todo = newTodo(nextTodoId(), request.title);
  writeTodo(todo);
  return todo;
}

export function toggleTodo(request: TodoRequest): Todo {
  const todo = readTodo(request.id);
  if (!todo) {
    throw new TodoNotFoundError(request.id);
  }
  const next = toggled(todo);
  writeTodo(next);
  return next;
}

export function deleteTodo(request: TodoRequest): TodoRequest {
  if (!removeTodo(request.id)) {
    throw new TodoNotFoundError(request.id);
  }
  return { id: request.id };
}
