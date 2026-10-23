import { newTodo, type Todo, toggled } from './domain.ts';
import { eraseTodo, nextTodoId, readTodo, readTodos, writeTodo } from './integrations.ts';

/** The request names a todo id that the list does not hold. */
export class TodoNotFoundError extends Error {
  constructor(id: string) {
    super(`No todo has the id ${id}`);
    this.name = 'TodoNotFoundError';
  }
}

export interface CreateTodoRequest {
  readonly title: string;
}

export interface TodoIdRequest {
  readonly id: string;
}

export function listTodos(): readonly Todo[] {
  return readTodos();
}

export function createTodo(request: CreateTodoRequest): Todo {
  const todo = newTodo(nextTodoId(), request.title);
  writeTodo(todo);
  return todo;
}

export function toggleTodo(request: TodoIdRequest): Todo {
  const todo = readTodo(request.id);
  if (!todo) {
    throw new TodoNotFoundError(request.id);
  }
  const next = toggled(todo);
  writeTodo(next);
  return next;
}

export function deleteTodo(request: TodoIdRequest): Todo {
  const todo = readTodo(request.id);
  if (!todo) {
    throw new TodoNotFoundError(request.id);
  }
  eraseTodo(todo.id);
  return todo;
}
