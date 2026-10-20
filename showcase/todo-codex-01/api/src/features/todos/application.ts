import { type Todo, toggleTodo } from './domain.ts';
import { insertTodo, readTodo, readTodos, removeTodo, saveTodo } from './integrations.ts';

export function listTodos(): Todo[] {
  return readTodos();
}

export function createTodo(request: { readonly title: string }): Todo {
  return insertTodo(request.title);
}

export function toggleCompleted(request: { readonly id: string }): Todo | undefined {
  const todo = readTodo(request.id);
  return todo ? saveTodo(toggleTodo(todo)) : undefined;
}

export function deleteTodo(request: { readonly id: string }): boolean {
  return removeTodo(request.id);
}
