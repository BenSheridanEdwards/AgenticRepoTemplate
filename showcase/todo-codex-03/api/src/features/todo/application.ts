import { normalizeTitle, toggleTodo } from './domain.ts';
import { findTodo, insertTodo, listTodos, removeTodo, saveTodo } from './integrations.ts';

export function list() {
  return listTodos();
}

export function create(input: { readonly title: string }) {
  return insertTodo(normalizeTitle(input.title));
}

export function toggle(input: { readonly id: string }) {
  const todo = findTodo(input.id);
  return todo ? saveTodo(toggleTodo(todo)) : null;
}

export function deleteTodo(input: { readonly id: string }) {
  removeTodo(input.id);
  return null;
}
