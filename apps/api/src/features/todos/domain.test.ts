import { createTodo, toggleCompletion } from './domain.ts';

it('creates an incomplete todo with exactly the three fields', () => {
  expect(createTodo('one', 'Read')).toEqual({ id: 'one', title: 'Read', completed: false });
});

it('toggles completion without changing the original', () => {
  const todo = createTodo('one', 'Read');
  expect(toggleCompletion(todo)).toEqual({ ...todo, completed: true });
  expect(toggleCompletion(toggleCompletion(todo))).toEqual(todo);
  expect(todo.completed).toBe(false);
});
