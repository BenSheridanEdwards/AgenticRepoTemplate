import { createTodo, type Todo, toggleCompletion } from './domain.ts';
import { newTodoId, readTodos, writeTodos } from './integrations.ts';

export function listTodos(): readonly Todo[] {
  return readTodos();
}

export function addTodo(title: string): Todo {
  const todo = createTodo(newTodoId(), title);
  writeTodos([...readTodos(), todo]);
  return todo;
}

export function toggleTodo(id: string): Todo | undefined {
  const todo = readTodos().find((item) => item.id === id);
  if (!todo) return undefined;
  const updated = toggleCompletion(todo);
  writeTodos(readTodos().map((item) => (item.id === id ? updated : item)));
  return updated;
}

export function deleteTodo(id: string): boolean {
  const before = readTodos();
  const after = before.filter((todo) => todo.id !== id);
  writeTodos(after);
  return after.length !== before.length;
}
