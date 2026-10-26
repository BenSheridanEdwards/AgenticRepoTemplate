import { createCallerFactory } from '../../trpc.ts';
import { todosRouter } from './procedures.ts';

const caller = createCallerFactory(todosRouter)({});

it('validates and trims the title and exposes the todo lifecycle', async () => {
  const todo = await caller.create({ title: '  Read  ' });
  expect(todo).toEqual({ id: expect.any(String), title: 'Read', completed: false });
  expect(await caller.list()).toContainEqual(todo);
  await expect(caller.toggle({ id: todo.id })).resolves.toEqual({ ...todo, completed: true });
  await expect(caller.delete({ id: todo.id })).resolves.toBe(true);
  expect(await caller.list()).not.toContainEqual(todo);
});

it.each(['', '   '])('rejects blank title %j', async (title) => {
  await expect(caller.create({ title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('reports a missing todo and permits repeated deletion', async () => {
  await expect(caller.toggle({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(caller.delete({ id: 'missing' })).resolves.toBe(false);
});

it('rejects blank ids', async () => {
  await expect(caller.toggle({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(caller.delete({ id: ' ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
