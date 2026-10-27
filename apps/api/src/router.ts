import { greetingRouter } from './features/greeting/index.ts';
import { todosRouter } from './features/todos/index.ts';
import { router } from './trpc.ts';

export const appRouter = router({ greeting: greetingRouter, todos: todosRouter });

export type AppRouter = typeof appRouter;
