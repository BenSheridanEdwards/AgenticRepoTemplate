import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../../trpc.ts';
import { todoRouter } from './procedures.ts';

const caller = createCallerFactory(todoRouter)({});

it('creates a trimmed todo, lists it, toggles it and deletes it', async () => {
  const created = await caller.create({ title: '  Buy milk ' });
  expect(created).toMatchObject({ title: 'Buy milk', completed: false });
  await expect(caller.list()).resolves.toContainEqual(created);

  await caller.toggle({ id: created.id });
  const toggled = (await caller.list()).find((item) => item.id === created.id);
  expect(toggled?.completed).toBe(true);

  await caller.remove({ id: created.id });
  expect((await caller.list()).some((item) => item.id === created.id)).toBe(false);
});

it.each(['', '   '])('rejects the blank title %j as a bad request', async (title) => {
  await expect(caller.create({ title })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'BAD_REQUEST',
  });
});
