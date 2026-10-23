import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../../trpc.ts';
import { todosRouter } from './procedures.ts';

const caller = createCallerFactory(todosRouter)({});

it('creates a todo with the trimmed title and lists it', async () => {
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

it('toggles a todo complete and back', async () => {
  const todo = await caller.create({ title: 'Walk the dog' });

  await expect(caller.toggle({ id: todo.id })).resolves.toEqual({ ...todo, completed: true });
  await expect(caller.toggle({ id: todo.id })).resolves.toEqual(todo);
});

it('deletes a todo', async () => {
  const todo = await caller.create({ title: 'Water the plants' });

  await expect(caller.delete({ id: todo.id })).resolves.toEqual({ id: todo.id });
  await expect(caller.list()).resolves.not.toContainEqual(todo);
});

it.each([
  'toggle',
  'delete',
] as const)('answers %s of an unknown id with not found', async (name) => {
  await expect(caller[name]({ id: 'missing' })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'NOT_FOUND',
  });
});

it('rejects an empty id as a bad request', async () => {
  await expect(caller.toggle({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
