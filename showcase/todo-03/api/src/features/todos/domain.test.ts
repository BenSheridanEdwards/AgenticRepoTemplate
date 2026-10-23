import { createTodo, toggleTodo } from './domain.ts';

it('creates a todo that is not complete', () => {
  expect(createTodo('1', 'Buy milk')).toEqual({ id: '1', title: 'Buy milk', completed: false });
});

it('toggles a todo complete and back', () => {
  const todo = createTodo('1', 'Buy milk');

  expect(toggleTodo(todo)).toEqual({ ...todo, completed: true });
  expect(toggleTodo(toggleTodo(todo))).toEqual(todo);
});
