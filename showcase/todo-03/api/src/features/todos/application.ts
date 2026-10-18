import { createTodo, type Todo, toggleCompleted } from './domain.ts';
import { newTodoId, readTodo, readTodos, removeTodo, writeTodo } from './integrations.ts';

export interface CreateTodoRequest {
  readonly title: string;
}

export interface TodoIdRequest {
  readonly id: string;
}

export function listTodos(): readonly Todo[] {
  return readTodos();
}

export function addTodo(request: CreateTodoRequest): Todo {
  const todo = createTodo(newTodoId(), request.title);
  writeTodo(todo);
  return todo;
}

/** The toggled todo, or `undefined` when no todo has the id. */
export function toggleTodo(request: TodoIdRequest): Todo | undefined {
  const todo = readTodo(request.id);
  if (!todo) {
    return undefined;
  }
  const toggled = toggleCompleted(todo);
  writeTodo(toggled);
  return toggled;
}

/** True when a todo with the id was deleted. */
export function deleteTodo(request: TodoIdRequest): boolean {
  return removeTodo(request.id);
}
