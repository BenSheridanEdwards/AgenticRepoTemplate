import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodo, deleteTodo, listTodos, toggleComplete } from './application.ts';

const titleSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idSchema = Schema.Struct({ id: Schema.String });
export const todosRouter = router({
  list: procedure.input(Schema.toStandardSchemaV1(Schema.Void)).query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(titleSchema))
    .mutation(({ input }) => createTodo(input.title)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(idSchema))
    .mutation(({ input }) => toggleComplete(input.id)),
  delete: procedure
    .input(Schema.toStandardSchemaV1(idSchema))
    .mutation(({ input }) => deleteTodo(input.id)),
});
