import { todoRouter } from './features/todo/index.ts';
import { router } from './trpc.ts';

export const appRouter = router({ todo: todoRouter });
export type AppRouter = typeof appRouter;
