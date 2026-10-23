import { addTodo, deleteTodo, listTodos, toggleCompleted } from './application.ts';

it('stores, lists, toggles and deletes todos independently', () => {
  const first = addTodo('  First  ');
  const second = addTodo('Second');
  expect(first.id).not.toBe(second.id);
  expect(listTodos()).toEqual([first, second]);
  expect(toggleCompleted(first.id)).toEqual({ ...first, completed: true });
  expect(toggleCompleted(first.id)).toEqual(first);
  deleteTodo(first.id);
  expect(listTodos()).toEqual([second]);
  deleteTodo(second.id);
  expect(listTodos()).toEqual([]);
});

it('handles missing ids', () => {
  expect(toggleCompleted('missing')).toBeUndefined();
  expect(deleteTodo('missing')).toEqual({ success: true });
});
