import { appRouter } from '../../router.ts';
import { createCallerFactory } from '../../trpc.ts';

const caller = createCallerFactory(appRouter)({});

it('runs the todo lifecycle through the router', async () => {
  const todo = await caller.todos.create({ title: '  Read  ' });
  expect(todo).toEqual({ id: expect.any(String), title: 'Read', completed: false });
  expect(await caller.todos.list()).toContainEqual(todo);
  expect(await caller.todos.toggle({ id: todo.id })).toEqual({ ...todo, completed: true });
  await caller.todos.delete({ id: todo.id });
  expect(await caller.todos.list()).not.toContainEqual(todo);
});

it.each(['', '  '])('rejects blank input %j', async (title) => {
  await expect(caller.todos.create({ title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('reports a missing todo and rejects invalid ids', async () => {
  await expect(caller.todos.toggle({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(caller.todos.toggle({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(caller.todos.delete({ id: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
