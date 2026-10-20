import { appRouter } from '../../router.ts';
import { createCallerFactory } from '../../trpc.ts';

const caller = createCallerFactory(appRouter)({});

it('serves todos through validated procedures', async () => {
  const todo = await caller.todos.create({ title: '  Read  ' });
  expect(todo.title).toBe('Read');
  expect(await caller.todos.list()).toContainEqual(todo);
  expect(await caller.todos.toggle({ id: todo.id })).toEqual({ ...todo, completed: true });
  await caller.todos.delete({ id: todo.id });
  expect(await caller.todos.list()).not.toContainEqual(todo);
  await expect(caller.todos.toggle({ id: todo.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it.each(['', '   '])('rejects a blank title %j', async (title) => {
  await expect(caller.todos.create({ title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('rejects an empty id', async () => {
  await expect(caller.todos.toggle({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(caller.todos.delete({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
