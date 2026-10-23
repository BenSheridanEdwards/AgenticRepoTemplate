import { createTodo, type Todo, toggleTodo } from './domain.ts';
import { newTodoId, readTodo, readTodos, removeTodo, writeTodo } from './integrations.ts';

export interface CreateTodoRequest {
  readonly title: Todo['title'];
}

export interface TodoRequest {
  readonly id: Todo['id'];
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
export function toggleTodoById(request: TodoRequest): Todo | undefined {
  const todo = readTodo(request.id);
  if (!todo) {
    return undefined;
  }
  const toggled = toggleTodo(todo);
  writeTodo(toggled);
  return toggled;
}

/** Whether a todo with the id existed and is now gone. */
export function deleteTodo(request: TodoRequest): boolean {
  return removeTodo(request.id);
}
