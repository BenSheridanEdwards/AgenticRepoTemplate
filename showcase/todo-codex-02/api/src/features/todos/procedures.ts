import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodo, deleteTodo, listTodos, toggleCompleted } from './application.ts';

const createInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idInputSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

export const todosRouter = router({
  list: procedure.input(Schema.toStandardSchemaV1(Schema.Void)).query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(createInputSchema))
    .mutation(({ input }) => createTodo(input)),
  toggle: procedure.input(Schema.toStandardSchemaV1(idInputSchema)).mutation(({ input }) => {
    try {
      return toggleCompleted(input);
    } catch {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Todo not found' });
    }
  }),
  delete: procedure
    .input(Schema.toStandardSchemaV1(idInputSchema))
    .mutation(({ input }) => deleteTodo(input)),
});
