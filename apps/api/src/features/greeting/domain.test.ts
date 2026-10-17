import { formatGreeting } from './domain.ts';

it('greets a name', () => {
  expect(formatGreeting('Ada')).toBe('Hello, Ada!');
});
