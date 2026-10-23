import { normalizeTitle, toggleTodo } from './domain.ts';
import { insertTodo, readTodo, readTodos, removeTodo, saveTodo } from './integrations.ts';
export function listTodos() {
  return readTodos();
}
export function createTodo(title: string) {
  return insertTodo(normalizeTitle(title));
}
export function toggleComplete(id: string) {
  const todo = readTodo(id);
  return todo ? saveTodo(toggleTodo(todo)) : null;
}
export function deleteTodo(id: string) {
  removeTodo(id);
  return null;
}
