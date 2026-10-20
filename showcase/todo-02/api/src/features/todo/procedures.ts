import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodo, listTodos, removeTodo, toggleTodo } from './application.ts';

const createTodoInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const todoIdInputSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

export const todoRouter = router({
  list: procedure.query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(createTodoInputSchema))
    .mutation(({ input }) => createTodo(input)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(todoIdInputSchema))
    .mutation(({ input }) => toggleTodo(input)),
  remove: procedure
    .input(Schema.toStandardSchemaV1(todoIdInputSchema))
    .mutation(({ input }) => removeTodo(input)),
});
