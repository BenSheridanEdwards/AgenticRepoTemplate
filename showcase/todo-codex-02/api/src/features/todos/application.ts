import { createTodo, type Todo, toggleTodo } from './domain.ts';
import {
  deleteStoredTodo,
  findStoredTodo,
  listStoredTodos,
  nextTodoId,
  saveTodo,
} from './integrations.ts';

export function listTodos(): Todo[] {
  return listStoredTodos();
}

export function addTodo(title: string): Todo {
  const todo = createTodo(nextTodoId(), title);
  saveTodo(todo);
  return todo;
}

export function toggleCompleted(id: string): Todo | undefined {
  const todo = findStoredTodo(id);
  if (!todo) {
    return undefined;
  }
  const updated = toggleTodo(todo);
  saveTodo(updated);
  return updated;
}

export function deleteTodo(id: string): { readonly success: boolean } {
  deleteStoredTodo(id);
  return { success: true };
}
