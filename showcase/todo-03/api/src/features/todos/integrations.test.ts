import { newTodoId, readTodo, readTodos, removeTodo, writeTodo } from './integrations.ts';

it('gives each todo a new id', () => {
  expect(newTodoId()).not.toBe(newTodoId());
});

it('writes, reads, overwrites and removes a todo in memory', () => {
  const id = newTodoId();
  writeTodo({ id, title: 'Buy milk', completed: false });
  writeTodo({ id, title: 'Buy milk', completed: true });

  expect(readTodo(id)).toEqual({ id, title: 'Buy milk', completed: true });
  expect(readTodos()).toContainEqual({ id, title: 'Buy milk', completed: true });

  expect(removeTodo(id)).toBe(true);
  expect(readTodo(id)).toBeUndefined();
  expect(removeTodo(id)).toBe(false);
});
