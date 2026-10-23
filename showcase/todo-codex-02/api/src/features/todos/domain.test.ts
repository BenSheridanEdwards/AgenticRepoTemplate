import { normalizeTitle, toggleTodo } from './domain.ts';

it('normalizes titles and refuses blank ones', () => {
  expect(normalizeTitle('  Read  ')).toBe('Read');
  expect(() => normalizeTitle('  ')).toThrow('Enter a title');
});
it('toggles in both directions without changing the original', () => {
  const todo = { id: '1', title: 'Read', completed: false };
  expect(toggleTodo(todo).completed).toBe(true);
  expect(toggleTodo(toggleTodo(todo))).toEqual(todo);
});
