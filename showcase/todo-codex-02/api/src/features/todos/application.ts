import { toggleTodo } from './domain.ts';
import { insertTodo, readTodo, readTodos, removeTodo, saveTodo } from './integrations.ts';

export function listTodos() {
  return readTodos();
}

export function createTodo(request: { readonly title: string }) {
  return insertTodo(request.title);
}

export function toggleCompleted(request: { readonly id: string }) {
  return saveTodo(toggleTodo(readTodo(request.id)));
}

export function deleteTodo(request: { readonly id: string }) {
  removeTodo(request.id);
  return { id: request.id };
}
