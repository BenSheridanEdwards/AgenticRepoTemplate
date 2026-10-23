import { todosRouter } from './features/todos/index.ts';
import { router } from './trpc.ts';
export const appRouter = router({ todos: todosRouter });
export type AppRouter = typeof appRouter;
