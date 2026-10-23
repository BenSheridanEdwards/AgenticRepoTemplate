import { createCallerFactory } from '../../trpc.ts';
import { todoRouter } from './procedures.ts';

const caller = createCallerFactory(todoRouter)({});
it('creates, lists, toggles and deletes in process memory', async () => {
  const todo = await caller.create({ title: '  Read  ' });
  expect(todo).toEqual({ id: expect.any(String), title: 'Read', completed: false });
  expect(await caller.list()).toContainEqual(todo);
  expect(await caller.toggle({ id: todo.id })).toEqual({ ...todo, completed: true });
  expect(await caller.toggle({ id: todo.id })).toEqual(todo);
  await caller.delete({ id: todo.id });
  expect(await caller.list()).not.toContainEqual(todo);
  expect(await caller.toggle({ id: todo.id })).toBeNull();
});
it.each(['', '   '])('rejects blank titles %j', async (title) => {
  await expect(caller.create({ title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
it('rejects invalid identifiers', async () => {
  await expect(caller.toggle({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(caller.delete({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
