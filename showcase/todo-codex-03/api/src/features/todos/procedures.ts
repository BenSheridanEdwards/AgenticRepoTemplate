import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { create, deleteTodo, list, toggle } from './application.ts';

const titleSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

export const todosRouter = router({
  list: procedure.input(Schema.toStandardSchemaV1(Schema.Void)).query(() => list()),
  create: procedure
    .input(Schema.toStandardSchemaV1(titleSchema))
    .mutation(({ input }) => create(input)),
  toggle: procedure.input(Schema.toStandardSchemaV1(idSchema)).mutation(({ input }) => {
    const todo = toggle(input);
    if (!todo) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Todo no longer exists' });
    }
    return todo;
  }),
  delete: procedure
    .input(Schema.toStandardSchemaV1(idSchema))
    .mutation(({ input }) => deleteTodo(input)),
});
