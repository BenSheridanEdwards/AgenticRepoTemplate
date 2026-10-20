import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../../trpc.ts';
import { todoRouter } from './procedures.ts';

const caller = createCallerFactory(todoRouter)({});

it('creates a trimmed todo, lists it, toggles it and deletes it', async () => {
  const created = await caller.create({ title: '  Buy milk  ' });
  expect(created).toMatchObject({ title: 'Buy milk', completed: false });
  expect(created.id).toBeTruthy();

  expect(await caller.list()).toContainEqual(created);

  const toggled = await caller.toggle({ id: created.id });
  expect(toggled).toMatchObject({ id: created.id, completed: true });

  await expect(caller.delete({ id: created.id })).resolves.toEqual({ id: created.id });
  expect(await caller.list()).not.toContainEqual(expect.objectContaining({ id: created.id }));
});

it.each(['', '   '])('rejects the blank title %j as a bad request', async (title) => {
  await expect(caller.create({ title })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'BAD_REQUEST',
  });
});

it('answers not found when toggling or deleting an unknown id', async () => {
  await expect(caller.toggle({ id: 'missing' })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'NOT_FOUND',
  });
  await expect(caller.delete({ id: 'missing' })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'NOT_FOUND',
  });
});
