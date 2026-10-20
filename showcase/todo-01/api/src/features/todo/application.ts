import { createTodo, type Todo, toggleCompleted } from './domain.ts';
import { allTodos, deleteTodo, findTodo, nextId, saveTodo } from './integrations.ts';

export function listTodos(): readonly Todo[] {
  return allTodos();
}

export function addTodo(title: string): Todo {
  const todo = createTodo(nextId(), title);
  saveTodo(todo);
  return todo;
}

export function toggleTodo(id: string): Todo | undefined {
  const todo = findTodo(id);
  if (!todo) {
    return undefined;
  }
  const next = toggleCompleted(todo);
  saveTodo(next);
  return next;
}

export function removeTodo(id: string): boolean {
  return deleteTodo(id);
}
