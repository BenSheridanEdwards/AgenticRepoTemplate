import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { addTodo, listTodos, removeTodo, toggleTodo } from './application.ts';

const createTodoInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const todoIdInputSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

export const todoRouter = router({
  list: procedure.query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(createTodoInputSchema))
    .mutation(({ input }) => addTodo(input.title)),
  toggle: procedure.input(Schema.toStandardSchemaV1(todoIdInputSchema)).mutation(({ input }) => {
    const todo = toggleTodo(input.id);
    if (!todo) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `No todo with id ${input.id}` });
    }
    return todo;
  }),
  delete: procedure.input(Schema.toStandardSchemaV1(todoIdInputSchema)).mutation(({ input }) => {
    if (!removeTodo(input.id)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `No todo with id ${input.id}` });
    }
    return { id: input.id };
  }),
});
