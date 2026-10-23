import { createCallerFactory } from '../../trpc.ts';
import { todoRouter } from './procedures.ts';

const caller = createCallerFactory(todoRouter)({});

it('runs the todo lifecycle through validated procedures', async () => {
  const todo = await caller.create({ title: '  Read  ' });
  expect(todo.title).toBe('Read');
  expect(await caller.list()).toContainEqual(todo);
  expect(await caller.toggle({ id: todo.id })).toEqual({ ...todo, completed: true });
  await caller.delete({ id: todo.id });
  expect(await caller.list()).not.toContainEqual(todo);
});

it.each(['', '   '])('rejects blank titles %j', async (title) => {
  await expect(caller.create({ title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('rejects blank ids', async () => {
  await expect(caller.toggle({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(caller.delete({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
