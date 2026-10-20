import { createTodo, deleteTodo, listTodos, toggleTodo } from './application.ts';

it('creates, lists, toggles and deletes a todo', () => {
  const created = createTodo({ title: 'Read a book' });
  expect(created).toMatchObject({ title: 'Read a book', completed: false });
  expect(listTodos()).toContainEqual(created);

  expect(toggleTodo({ id: created.id })?.completed).toBe(true);
  expect(deleteTodo({ id: created.id })).toBe(true);
  expect(listTodos()).not.toContainEqual(created);
});

it('reports a missing todo on toggle and delete', () => {
  expect(toggleTodo({ id: 'missing' })).toBeUndefined();
  expect(deleteTodo({ id: 'missing' })).toBe(false);
});
