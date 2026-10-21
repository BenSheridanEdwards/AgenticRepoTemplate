import { createCallerFactory } from '../../trpc.ts';
import { todosRouter } from './procedures.ts';

const caller = createCallerFactory(todosRouter)({});

it('trims titles and exposes the todo lifecycle', async () => {
  const todo = await caller.create({ title: '  Read  ' });
  expect(todo.title).toBe('Read');
  expect(await caller.list()).toContainEqual(todo);
  expect(await caller.toggle({ id: todo.id })).toEqual({ ...todo, completed: true });
  await caller.delete({ id: todo.id });
  expect(await caller.list()).not.toContainEqual(todo);
  await expect(caller.toggle({ id: todo.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it.each(['', '   '])('rejects blank titles %j', async (title) => {
  await expect(caller.create({ title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('rejects blank identifiers', async () => {
  await expect(caller.toggle({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(caller.delete({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
