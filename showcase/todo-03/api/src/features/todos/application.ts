import { createTodo, type Todo, toggleTodo } from './domain.ts';
import { nextTodoId, readTodo, readTodos, removeTodo, writeTodo } from './integrations.ts';

export interface AddTodoRequest {
  readonly title: string;
}

export interface TodoRequest {
  readonly id: string;
}

/** A use case asked for a todo the store does not hold. */
export class TodoNotFoundError extends Error {
  constructor(id: string) {
    super(`No todo has the id ${id}`);
    this.name = 'TodoNotFoundError';
  }
}

export function listTodos(): readonly Todo[] {
  return readTodos();
}

export function addTodo(request: AddTodoRequest): Todo {
  const todo = createTodo(nextTodoId(), request.title);
  writeTodo(todo);
  return todo;
}

export function toggleTodoById(request: TodoRequest): Todo {
  const todo = readTodo(request.id);
  if (!todo) {
    throw new TodoNotFoundError(request.id);
  }
  const toggled = toggleTodo(todo);
  writeTodo(toggled);
  return toggled;
}

export function deleteTodo(request: TodoRequest): Todo {
  const todo = readTodo(request.id);
  if (!todo) {
    throw new TodoNotFoundError(request.id);
  }
  removeTodo(todo.id);
  return todo;
}
