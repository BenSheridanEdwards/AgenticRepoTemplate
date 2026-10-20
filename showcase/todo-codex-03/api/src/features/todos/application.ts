import { toggleTodo } from './domain.ts';
import { findTodo, insertTodo, listTodos, removeTodo, saveTodo } from './integrations.ts';

export function list() {
  return listTodos();
}

export function create(request: { readonly title: string }) {
  return insertTodo(request.title);
}

export function toggle(request: { readonly id: string }) {
  const todo = findTodo(request.id);
  return todo ? saveTodo(toggleTodo(todo)) : undefined;
}

export function deleteTodo(request: { readonly id: string }) {
  return removeTodo(request.id);
}
