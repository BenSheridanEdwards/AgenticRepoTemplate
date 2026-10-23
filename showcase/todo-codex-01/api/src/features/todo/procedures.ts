import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodo, deleteTodo, listTodos, toggleComplete } from './application.ts';

const titleInput = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idInput = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

export const todoRouter = router({
  list: procedure.input(Schema.toStandardSchemaV1(Schema.Void)).query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(titleInput))
    .mutation(({ input }) => createTodo(input.title)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(idInput))
    .mutation(({ input }) => toggleComplete(input.id)),
  delete: procedure
    .input(Schema.toStandardSchemaV1(idInput))
    .mutation(({ input }) => deleteTodo(input.id)),
});
