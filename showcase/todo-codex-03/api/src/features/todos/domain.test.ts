import { toggleTodo } from './domain.ts';

it('toggles completion both ways without changing the original', () => {
  const todo = { id: 'one', title: 'Read', completed: false };
  const completed = toggleTodo(todo);
  expect(completed).toEqual({ ...todo, completed: true });
  expect(toggleTodo(completed)).toEqual(todo);
  expect(todo.completed).toBe(false);
});
