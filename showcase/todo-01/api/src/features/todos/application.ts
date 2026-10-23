import { createTodo, type Todo, toggleCompleted } from './domain.ts';
import { newTodoId, readTodo, readTodos, removeTodo, writeTodo } from './integrations.ts';

export interface AddTodoRequest {
  readonly title: string;
}

export interface TodoRequest {
  readonly id: Todo['id'];
}

export function listTodos(): readonly Todo[] {
  return readTodos();
}

export function addTodo(request: AddTodoRequest): Todo {
  const todo = createTodo(newTodoId(), request.title);
  writeTodo(todo);
  return todo;
}

/** The toggled todo, or `undefined` when no todo has the id. */
export function toggleTodo(request: TodoRequest): Todo | undefined {
  const todo = readTodo(request.id);
  if (!todo) {
    return undefined;
  }
  const toggled = toggleCompleted(todo);
  writeTodo(toggled);
  return toggled;
}

/** The deleted todo, or `undefined` when no todo has the id. */
export function deleteTodo(request: TodoRequest): Todo | undefined {
  const todo = readTodo(request.id);
  if (todo) {
    removeTodo(todo.id);
  }
  return todo;
}
