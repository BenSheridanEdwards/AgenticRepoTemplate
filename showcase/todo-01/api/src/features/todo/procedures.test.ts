import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../../trpc.ts';
import { todoRouter } from './procedures.ts';

const caller = createCallerFactory(todoRouter)({});

it('creates a trimmed todo, lists it, toggles it and deletes it', async () => {
  const created = await caller.create({ title: '  Buy milk ' });
  expect(created).toMatchObject({ title: 'Buy milk', completed: false });

  await expect(caller.list()).resolves.toContainEqual(created);

  await expect(caller.toggle({ id: created.id })).resolves.toMatchObject({
    id: created.id,
    completed: true,
  });

  await expect(caller.delete({ id: created.id })).resolves.toEqual({ id: created.id });
  await expect(caller.list()).resolves.not.toContainEqual(created);
});

it.each(['', '   '])('rejects the blank title %j as a bad request', async (title) => {
  await expect(caller.create({ title })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'BAD_REQUEST',
  });
});

it('rejects toggling or deleting an unknown id as not found', async () => {
  await expect(caller.toggle({ id: 'missing-id' })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'NOT_FOUND',
  });
  await expect(caller.delete({ id: 'missing-id' })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'NOT_FOUND',
  });
});
