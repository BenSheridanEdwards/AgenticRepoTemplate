import { normalizeTitle, toggleTodo } from './domain.ts';

it('requires a nonblank title and trims it', () => {
  expect(normalizeTitle('  Read  ')).toBe('Read');
  expect(() => normalizeTitle('   ')).toThrow('Enter a title');
});

it('toggles without changing the original todo', () => {
  const todo = { id: 'one', title: 'Read', completed: false };
  expect(toggleTodo(todo)).toEqual({ ...todo, completed: true });
  expect(toggleTodo(toggleTodo(todo))).toEqual(todo);
  expect(todo.completed).toBe(false);
});
