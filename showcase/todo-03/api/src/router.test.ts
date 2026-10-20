import { appRouter } from './router.ts';
import { createCallerFactory } from './trpc.ts';

it('serves the todo feature under todo.list', async () => {
  const caller = createCallerFactory(appRouter)({});

  await expect(caller.todo.list()).resolves.toEqual(expect.any(Array));
});
