import { greetingRouter } from './features/greeting/index.ts';
import { router } from './trpc.ts';

export const appRouter = router({ greeting: greetingRouter });

export type AppRouter = typeof appRouter;
