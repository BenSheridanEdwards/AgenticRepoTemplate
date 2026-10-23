import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { addTodo, deleteTodo, listTodos, TodoNotFoundError, toggleTodo } from './application.ts';

const addInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const todoInputSchema = Schema.Struct({ id: Schema.String });

function orNotFound<Output>(run: () => Output): Output {
  try {
    return run();
  } catch (cause) {
    if (cause instanceof TodoNotFoundError) {
      throw new TRPCError({ code: 'NOT_FOUND', message: cause.message, cause });
    }
    throw cause;
  }
}

export const todosRouter = router({
  list: procedure.query(() => listTodos()),
  add: procedure
    .input(Schema.toStandardSchemaV1(addInputSchema))
    .mutation(({ input }) => addTodo(input)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(todoInputSchema))
    .mutation(({ input }) => orNotFound(() => toggleTodo(input))),
  delete: procedure
    .input(Schema.toStandardSchemaV1(todoInputSchema))
    .mutation(({ input }) => orNotFound(() => deleteTodo(input))),
});
