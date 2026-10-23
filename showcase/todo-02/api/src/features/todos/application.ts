import { createTodo, type Todo, toggleCompleted } from './domain.ts';
import { findAllTodos, findTodo, nextTodoId, removeTodo, saveTodo } from './integrations.ts';

export class TodoNotFoundError extends Error {
  constructor(id: string) {
    super(`No todo has the id ${id}`);
    this.name = 'TodoNotFoundError';
  }
}

export interface AddTodoRequest {
  readonly title: string;
}

export interface TodoRequest {
  readonly id: string;
}

export function listTodos(): readonly Todo[] {
  return findAllTodos();
}

export function addTodo(request: AddTodoRequest): Todo {
  return saveTodo(createTodo(nextTodoId(), request.title));
}

export function toggleTodo(request: TodoRequest): Todo {
  const todo = findTodo(request.id);
  if (!todo) {
    throw new TodoNotFoundError(request.id);
  }
  return saveTodo(toggleCompleted(todo));
}

export function deleteTodo(request: TodoRequest): Todo {
  const todo = removeTodo(request.id);
  if (!todo) {
    throw new TodoNotFoundError(request.id);
  }
  return todo;
}
