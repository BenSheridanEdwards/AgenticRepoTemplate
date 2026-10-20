import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodo, deleteTodo, listTodos, toggleTodo } from './application.ts';

const createInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idInputSchema = Schema.Struct({ id: Schema.String });

export const todoRouter = router({
  list: procedure.query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(createInputSchema))
    .mutation(({ input }) => createTodo(input)),
  toggle: procedure.input(Schema.toStandardSchemaV1(idInputSchema)).mutation(({ input }) => {
    const todo = toggleTodo(input);
    if (!todo) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `No todo with id ${input.id}` });
    }
    return todo;
  }),
  delete: procedure.input(Schema.toStandardSchemaV1(idInputSchema)).mutation(({ input }) => {
    if (!deleteTodo(input)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `No todo with id ${input.id}` });
    }
    return { id: input.id };
  }),
});
