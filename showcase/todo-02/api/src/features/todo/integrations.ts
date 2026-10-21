import { randomUUID } from 'node:crypto';
import { makeTodo, type Todo, toggleCompleted } from './domain.ts';

// The api keeps the todos in memory, inside the api process, so they survive a
// page reload while it runs. Storage and the id effect live here (ARCHITECTURE).
const todosById = new Map<string, Todo>();

export function allTodos(): readonly Todo[] {
  return [...todosById.values()];
}

export function storeTodo(title: string): Todo {
  const todo = makeTodo(randomUUID(), title);
  todosById.set(todo.id, todo);
  return todo;
}

export function flipTodo(id: string): Todo | undefined {
  const existing = todosById.get(id);
  if (existing === undefined) {
    return undefined;
  }
  const toggled = toggleCompleted(existing);
  todosById.set(id, toggled);
  return toggled;
}

export function dropTodo(id: string): boolean {
  return todosById.delete(id);
}
