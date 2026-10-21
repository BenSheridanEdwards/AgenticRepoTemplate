import { toggleTodo } from './domain.ts';

it('toggles completion without changing the identity or title', () => {
  const todo = { id: 'one', title: 'Read', completed: false };
  expect(toggleTodo(todo)).toEqual({ ...todo, completed: true });
  expect(toggleTodo(toggleTodo(todo))).toEqual(todo);
  expect(todo.completed).toBe(false);
});
