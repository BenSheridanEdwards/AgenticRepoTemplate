import { makeTodo, toggleCompleted } from './domain.ts';

it('creates a todo that starts incomplete', () => {
  expect(makeTodo('id-1', 'Buy milk')).toEqual({
    id: 'id-1',
    title: 'Buy milk',
    completed: false,
  });
});

it('toggles completion each way without mutating the input', () => {
  const todo = makeTodo('id-1', 'Buy milk');

  const done = toggleCompleted(todo);

  expect(done.completed).toBe(true);
  expect(todo.completed).toBe(false);
  expect(toggleCompleted(done).completed).toBe(false);
});
