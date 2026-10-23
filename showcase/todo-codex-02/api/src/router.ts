import { todoRouter } from './features/todos/index.ts';
import { router } from './trpc.ts';
export const appRouter = router({ todos: todoRouter });
export type AppRouter = typeof appRouter;
