import { createTodo, toggleTodo } from './domain.ts';
import { nextId, readTodo, readTodos, removeTodo, saveTodo } from './integrations.ts';
export function listTodos() {
  return readTodos();
}
export function addTodo(title: string) {
  const todo = createTodo(nextId(), title);
  saveTodo(todo);
  return todo;
}
export function completeTodo(id: string) {
  const todo = readTodo(id);
  if (!todo) {
    return undefined;
  }
  const updated = toggleTodo(todo);
  saveTodo(updated);
  return updated;
}
export function deleteTodo(id: string) {
  removeTodo(id);
  return { deleted: true };
}
