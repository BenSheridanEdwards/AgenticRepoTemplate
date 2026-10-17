import { greet } from './application.ts';

it('answers a greet request with the greeting message', () => {
  expect(greet({ name: 'Grace' })).toEqual({ message: 'Hello, Grace!' });
});
