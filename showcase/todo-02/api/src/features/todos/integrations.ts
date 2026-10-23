import type { Todo } from './domain.ts';

/** The todos, kept in memory for the life of the api process. */
const todos = new Map<string, Todo>();
let lastId = 0;

export function nextTodoId(): string {
  lastId += 1;
  return String(lastId);
}

export function findAllTodos(): readonly Todo[] {
  return [...todos.values()];
}

export function findTodo(id: string): Todo | undefined {
  return todos.get(id);
}

export function saveTodo(todo: Todo): Todo {
  todos.set(todo.id, todo);
  return todo;
}

export function removeTodo(id: string): Todo | undefined {
  const todo = todos.get(id);
  todos.delete(id);
  return todo;
}
