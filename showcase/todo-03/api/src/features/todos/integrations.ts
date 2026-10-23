import type { Todo } from './domain.ts';

/** The todos, in memory for the life of the api process, in the order they were created. */
const todos = new Map<string, Todo>();

export function newTodoId(): string {
  return crypto.randomUUID();
}

export function readTodos(): readonly Todo[] {
  return [...todos.values()];
}

export function findTodo(id: string): Todo | undefined {
  return todos.get(id);
}

export function saveTodo(todo: Todo): void {
  todos.set(todo.id, todo);
}

/** Removes the todo and answers it, or undefined when it was not there. */
export function removeTodo(id: string): Todo | undefined {
  const todo = todos.get(id);
  todos.delete(id);
  return todo;
}
