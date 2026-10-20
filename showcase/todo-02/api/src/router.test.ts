import { appRouter } from './router.ts';
import { createCallerFactory } from './trpc.ts';

it('serves the todo feature: a created todo appears under todo.list', async () => {
  const caller = createCallerFactory(appRouter)({});

  const created = await caller.todo.create({ title: 'Read a book' });

  await expect(caller.todo.list()).resolves.toContainEqual(created);
});
