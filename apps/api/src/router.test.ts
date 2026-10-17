import { appRouter } from './router.ts';
import { createCallerFactory } from './trpc.ts';

it('serves the greeting feature under greeting.greet', async () => {
  const caller = createCallerFactory(appRouter)({});

  await expect(caller.greeting.greet({ name: 'Ada' })).resolves.toEqual({ message: 'Hello, Ada!' });
});
