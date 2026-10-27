import { addTodo, deleteTodo, listTodos, toggleTodo } from './application.ts';

it('keeps created todos in memory, toggles them and deletes by id', () => {
  const first = addTodo('Read');
  const second = addTodo('Read');
  expect(first.id).not.toBe(second.id);
  expect(listTodos()).toEqual(expect.arrayContaining([first, second]));
  expect(toggleTodo(first.id)).toEqual({ ...first, completed: true });
  expect(toggleTodo(first.id)).toEqual(first);
  expect(deleteTodo(first.id)).toBe(true);
  expect(listTodos()).not.toContainEqual(first);
  expect(listTodos()).toContainEqual(second);
  expect(deleteTodo(second.id)).toBe(true);
});

it('reports missing ids without changing the list', () => {
  const before = listTodos();
  expect(toggleTodo('missing')).toBeUndefined();
  expect(deleteTodo('missing')).toBe(false);
  expect(listTodos()).toEqual(before);
});
