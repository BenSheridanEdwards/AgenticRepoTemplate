import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

const todos = new Map<string, Todo>();

export function readTodos(): Todo[] {
  return [...todos.values()];
}

export function insertTodo(title: string): Todo {
  const todo = { id: randomUUID(), title, completed: false };
  todos.set(todo.id, todo);
  return todo;
}

export function readTodo(id: string): Todo {
  const todo = todos.get(id);
  if (!todo) {
    throw new Error('Todo not found');
  }
  return todo;
}

export function saveTodo(todo: Todo): Todo {
  todos.set(todo.id, todo);
  return todo;
}

export function removeTodo(id: string): void {
  todos.delete(id);
}
