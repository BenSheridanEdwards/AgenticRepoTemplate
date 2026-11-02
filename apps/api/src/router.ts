import { greetingRouter } from './features/greeting/index.ts';
import { recentGreetingsRouter } from './features/recent-greetings/index.ts';
import { router } from './trpc.ts';

export const appRouter = router({
  greeting: greetingRouter,
  recentGreetings: recentGreetingsRouter,
});

export type AppRouter = typeof appRouter;
