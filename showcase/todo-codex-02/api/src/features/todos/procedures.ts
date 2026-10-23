import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { create, list, remove, toggle } from './application.ts';

const titleInput = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idInput = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });
export const todoRouter = router({
  list: procedure.query(() => list()),
  create: procedure
    .input(Schema.toStandardSchemaV1(titleInput))
    .mutation(({ input }) => create(input.title)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(idInput))
    .mutation(({ input }) => toggle(input.id)),
  delete: procedure
    .input(Schema.toStandardSchemaV1(idInput))
    .mutation(({ input }) => remove(input.id)),
});
