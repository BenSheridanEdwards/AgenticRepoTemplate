import { createTodo, toggleCompleted } from './domain.ts';

it('creates a todo that starts not completed', () => {
  expect(createTodo('id-1', 'Buy milk')).toEqual({
    id: 'id-1',
    title: 'Buy milk',
    completed: false,
  });
});

it('toggles completed without mutating the input', () => {
  const todo = createTodo('id-1', 'Buy milk');

  const toggled = toggleCompleted(todo);

  expect(toggled).toEqual({ id: 'id-1', title: 'Buy milk', completed: true });
  expect(todo.completed).toBe(false);
  expect(toggleCompleted(toggled).completed).toBe(false);
});
