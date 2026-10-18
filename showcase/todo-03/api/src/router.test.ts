import { appRouter } from './router.ts';
import { createCallerFactory } from './trpc.ts';

it('serves the todos feature under todos', async () => {
  const caller = createCallerFactory(appRouter)({});

  const todo = await caller.todos.create({ title: 'Buy milk' });

  await expect(caller.todos.list()).resolves.toContainEqual(todo);
});
