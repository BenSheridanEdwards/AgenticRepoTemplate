import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { create, deleteTodo, list, toggle } from './application.ts';

const titleSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

export const todoRouter = router({
  list: procedure.input(Schema.toStandardSchemaV1(Schema.Void)).query(() => list()),
  create: procedure
    .input(Schema.toStandardSchemaV1(titleSchema))
    .mutation(({ input }) => create(input)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(idSchema))
    .mutation(({ input }) => toggle(input)),
  delete: procedure
    .input(Schema.toStandardSchemaV1(idSchema))
    .mutation(({ input }) => deleteTodo(input)),
});
