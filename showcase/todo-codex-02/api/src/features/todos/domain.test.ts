import { createTodo, toggleTodo } from './domain.ts';

it('creates only the todo fields and trims the title', () => {
  expect(createTodo('one', '  Read  ')).toEqual({ id: 'one', title: 'Read', completed: false });
});

it.each(['', '   '])('rejects a blank title %j', (title) => {
  expect(() => createTodo('one', title)).toThrow('Enter a title');
});

it('toggles in both directions without changing the original', () => {
  const todo = createTodo('one', 'Read');
  expect(toggleTodo(todo)).toEqual({ ...todo, completed: true });
  expect(toggleTodo(toggleTodo(todo))).toEqual(todo);
  expect(todo.completed).toBe(false);
});
