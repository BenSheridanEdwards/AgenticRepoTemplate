import { newTodo, toggleCompleted } from './domain.ts';

it('starts a new todo not completed', () => {
  expect(newTodo('1', 'Buy milk')).toEqual({ id: '1', title: 'Buy milk', completed: false });
});

it('toggles a todo complete and back', () => {
  const todo = newTodo('1', 'Buy milk');

  expect(toggleCompleted(todo)).toEqual({ ...todo, completed: true });
  expect(toggleCompleted(toggleCompleted(todo))).toEqual(todo);
});
