import { normalizeTitle, toggleTodo } from './domain.ts';
import { deleteTodo, findTodo, listTodos, newTodoId, storeTodo } from './integrations.ts';
export function list() {
  return listTodos();
}
export function create(title: string) {
  return storeTodo({ id: newTodoId(), title: normalizeTitle(title), completed: false });
}
export function toggle(id: string) {
  const todo = findTodo(id);
  return todo ? storeTodo(toggleTodo(todo)) : null;
}
export function remove(id: string) {
  deleteTodo(id);
  return null;
}
