import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../../trpc.ts';
import { todosRouter } from './procedures.ts';

const caller = createCallerFactory(todosRouter)({});

it('trims the title, creates the todo and lists it', async () => {
  const todo = await caller.create({ title: '  Buy milk ' });

  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  await expect(caller.list()).resolves.toContainEqual(todo);
});

it.each(['', '   '])('rejects the blank title %j as a bad request', async (title) => {
  await expect(caller.create({ title })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'BAD_REQUEST',
  });
});

it('toggles and deletes a todo', async () => {
  const { id } = await caller.create({ title: 'Walk the dog' });

  await expect(caller.toggle({ id })).resolves.toMatchObject({ id, completed: true });
  await caller.delete({ id });

  await expect(caller.list()).resolves.not.toContainEqual(expect.objectContaining({ id }));
});

it('answers an unknown todo with not found', async () => {
  await expect(caller.toggle({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(caller.delete({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
