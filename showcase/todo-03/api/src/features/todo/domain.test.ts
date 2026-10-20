import { newTodo, toggleCompletion } from './domain.ts';

it('makes a todo that starts not completed', () => {
  expect(newTodo('id-1', 'Buy milk')).toEqual({ id: 'id-1', title: 'Buy milk', completed: false });
});

it('toggles completion without mutating the original', () => {
  const todo = newTodo('id-1', 'Buy milk');

  const toggled = toggleCompletion(todo);

  expect(toggled.completed).toBe(true);
  expect(toggleCompletion(toggled).completed).toBe(false);
  expect(todo.completed).toBe(false);
});
