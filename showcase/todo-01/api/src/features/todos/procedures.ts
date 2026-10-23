import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodo, deleteTodo, listTodos, TodoNotFoundError, toggleTodo } from './application.ts';

const createInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const todoIdInputSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

function notFoundAsTrpcError<Result>(runUseCase: () => Result): Result {
  try {
    return runUseCase();
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
    .input(Schema.toStandardSchemaV1(createInputSchema))
    .mutation(({ input }) => createTodo(input)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(todoIdInputSchema))
    .mutation(({ input }) => notFoundAsTrpcError(() => toggleTodo(input))),
  delete: procedure
    .input(Schema.toStandardSchemaV1(todoIdInputSchema))
    .mutation(({ input }) => notFoundAsTrpcError(() => deleteTodo(input))),
});
