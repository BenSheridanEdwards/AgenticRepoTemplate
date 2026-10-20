import { appRouter } from './router.ts';
import { createCallerFactory } from './trpc.ts';

it('serves the todo feature under todo.create and todo.list', async () => {
  const caller = createCallerFactory(appRouter)({});

  const created = await caller.todo.create({ title: 'Buy milk' });

  await expect(caller.todo.list()).resolves.toContainEqual(created);
});
