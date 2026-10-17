import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodo, deleteTodo, listTodos, TodoNotFoundError, toggleTodo } from './application.ts';

const createTodoInputSchema = Schema.Struct({ title: Schema.Trim.pipe(Schema.nonEmptyString()) });
const todoIdInputSchema = Schema.Struct({ id: Schema.NonEmptyString });

/** Runs a use case and answers a missing todo as NOT_FOUND. */
function mapNotFound<Output>(run: () => Output): Output {
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
    .input(Schema.standardSchemaV1(createTodoInputSchema))
    .mutation(({ input }) => createTodo(input)),
  toggle: procedure
    .input(Schema.standardSchemaV1(todoIdInputSchema))
    .mutation(({ input }) => mapNotFound(() => toggleTodo(input))),
  delete: procedure
    .input(Schema.standardSchemaV1(todoIdInputSchema))
    .mutation(({ input }) => mapNotFound(() => deleteTodo(input))),
});
