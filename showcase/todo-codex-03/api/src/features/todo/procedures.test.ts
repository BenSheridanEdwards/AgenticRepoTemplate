import { createCallerFactory } from '../../trpc.ts';
import { normalizeTitle } from './domain.ts';
import { todoRouter } from './procedures.ts';

const caller = createCallerFactory(todoRouter)({});

it('creates, lists, toggles twice and deletes in memory', async () => {
  const todo = await caller.create({ title: '  Buy milk  ' });
  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(await caller.list()).toContainEqual(todo);
  expect(await caller.toggle({ id: todo.id })).toEqual({ ...todo, completed: true });
  expect(await caller.toggle({ id: todo.id })).toEqual(todo);
  await caller.delete({ id: todo.id });
  expect(await caller.list()).not.toContainEqual(todo);
  expect(await caller.toggle({ id: todo.id })).toBeNull();
  await caller.delete({ id: todo.id });
});

it.each(['', '   '])('rejects blank titles %j at both boundaries', async (title) => {
  expect(() => normalizeTitle(title)).toThrow('Enter a title');
  await expect(caller.create({ title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
