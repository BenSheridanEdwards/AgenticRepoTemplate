import { allTodos, deleteStoredTodo, insertTodo, toggleStoredTodo } from './integrations.ts';

it('stores a new todo and lists it with a generated id', () => {
  const todo = insertTodo('Buy milk');

  expect(todo).toMatchObject({ title: 'Buy milk', completed: false });
  expect(todo.id).toMatch(/[0-9a-f-]{36}/);
  expect(allTodos()).toContainEqual(todo);
});

it('toggles a stored todo and reports a missing one', () => {
  const todo = insertTodo('Walk the dog');

  expect(toggleStoredTodo(todo.id)?.completed).toBe(true);
  expect(toggleStoredTodo(todo.id)?.completed).toBe(false);
  expect(toggleStoredTodo('missing')).toBeUndefined();
});

it('deletes a stored todo and reports a missing one', () => {
  const todo = insertTodo('Water the plants');

  expect(deleteStoredTodo(todo.id)).toBe(true);
  expect(deleteStoredTodo(todo.id)).toBe(false);
  expect(allTodos()).not.toContainEqual(todo);
});
