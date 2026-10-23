import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodo, deleteTodo, listTodos, TodoNotFoundError, toggleTodo } from './application.ts';

const createTodoInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const todoInputSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

/** Runs a use case and answers a missing todo as NOT_FOUND. */
function withNotFound<Result>(run: () => Result): Result {
  try {
    return run();
  } catch (error) {
    if (error instanceof TodoNotFoundError) {
      throw new TRPCError({ code: 'NOT_FOUND', message: error.message, cause: error });
    }
    throw error;
  }
}

export const todosRouter = router({
  list: procedure.query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(createTodoInputSchema))
    .mutation(({ input }) => createTodo(input)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(todoInputSchema))
    .mutation(({ input }) => withNotFound(() => toggleTodo(input))),
  delete: procedure
    .input(Schema.toStandardSchemaV1(todoInputSchema))
    .mutation(({ input }) => withNotFound(() => deleteTodo(input))),
});
