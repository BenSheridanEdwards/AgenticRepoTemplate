import { create, deleteTodo, list, toggle } from './application.ts';

it('stores, lists, toggles and deletes only the requested todo', () => {
  const kept = create({ title: 'Keep' });
  const todo = create({ title: 'Read' });
  expect(Object.keys(todo).sort()).toEqual(['completed', 'id', 'title']);
  expect(list()).toEqual(expect.arrayContaining([kept, todo]));
  expect(toggle({ id: todo.id })).toEqual({ ...todo, completed: true });
  expect(toggle({ id: todo.id })).toEqual(todo);
  deleteTodo({ id: todo.id });
  expect(list()).not.toContainEqual(todo);
  expect(list()).toContainEqual(kept);
  expect(toggle({ id: todo.id })).toBeUndefined();
  deleteTodo({ id: kept.id });
  deleteTodo({ id: 'missing' });
});
