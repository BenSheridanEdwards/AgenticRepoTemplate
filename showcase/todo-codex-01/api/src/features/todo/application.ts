import { normalizeTitle, type Todo, toggleTodo } from './domain.ts';
import { findTodo, insertTodo, listStoredTodos, removeTodo, saveTodo } from './integrations.ts';

export function listTodos(): Todo[] {
  return listStoredTodos();
}

export function createTodo(title: string): Todo {
  return insertTodo(normalizeTitle(title));
}

export function toggleComplete(id: string): Todo | undefined {
  const todo = findTodo(id);
  return todo ? saveTodo(toggleTodo(todo)) : undefined;
}

export function deleteTodo(id: string): { readonly id: string } {
  removeTodo(id);
  return { id };
}
