import { appRouter } from './router.ts';
import { createCallerFactory } from './trpc.ts';

it('serves the greeting feature under greeting.greet', async () => {
  const caller = createCallerFactory(appRouter)({});

  await expect(caller.greeting.greet({ name: 'Ada' })).resolves.toEqual({ message: 'Hello, Ada!' });
});

it('serves the recent greetings feature under recentGreetings', async () => {
  const caller = createCallerFactory(appRouter)({});
  await caller.recentGreetings.record({ name: 'Lin' });
  await expect(caller.recentGreetings.list()).resolves.toEqual({ names: ['Lin'] });
});
