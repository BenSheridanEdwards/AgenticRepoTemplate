import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../../trpc.ts';
import { todosRouter } from './procedures.ts';

const caller = createCallerFactory(todosRouter)({});

it('trims the title, adds the todo and lists it', async () => {
  const todo = await caller.add({ title: '  Buy milk ' });

  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  await expect(caller.list()).resolves.toContainEqual(todo);
});

it.each(['', '   '])('rejects the blank title %j as a bad request', async (title) => {
  await expect(caller.add({ title })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'BAD_REQUEST',
  });
});

it('toggles a todo complete', async () => {
  const { id } = await caller.add({ title: 'Walk the dog' });

  await expect(caller.toggle({ id })).resolves.toMatchObject({ id, completed: true });
});

it('deletes a todo', async () => {
  const todo = await caller.add({ title: 'Water the plants' });

  await expect(caller.delete({ id: todo.id })).resolves.toEqual(todo);
  await expect(caller.list()).resolves.not.toContainEqual(todo);
});

it.each(['toggle', 'delete'] as const)('answers %s of an unknown id as not found', async (path) => {
  await expect(caller[path]({ id: 'unknown' })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'NOT_FOUND',
  });
});
