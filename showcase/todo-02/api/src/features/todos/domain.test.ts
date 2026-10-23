import { createTodo, toggleCompleted } from './domain.ts';

it('creates a todo that is not completed', () => {
  expect(createTodo('1', 'Buy milk')).toEqual({ id: '1', title: 'Buy milk', completed: false });
});

it('toggles a todo complete and back', () => {
  const todo = createTodo('1', 'Buy milk');

  expect(toggleCompleted(todo)).toEqual({ ...todo, completed: true });
  expect(toggleCompleted(toggleCompleted(todo))).toEqual(todo);
});
