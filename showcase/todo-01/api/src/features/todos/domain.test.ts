import { newTodo, toggled } from './domain.ts';

it('starts a new todo not completed', () => {
  expect(newTodo('1', 'Buy milk')).toEqual({ id: '1', title: 'Buy milk', completed: false });
});

it('toggles a todo complete and back', () => {
  const todo = newTodo('1', 'Buy milk');

  expect(toggled(todo)).toEqual({ id: '1', title: 'Buy milk', completed: true });
  expect(toggled(toggled(todo))).toEqual(todo);
});
