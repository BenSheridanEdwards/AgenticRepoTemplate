import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { addTodo, deleteTodo, listTodos, toggleTodoById } from './application.ts';

const createInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const todoIdInputSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

function notFound(id: string): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: `No todo has the id ${id}` });
}

export const todosRouter = router({
  list: procedure.query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(createInputSchema))
    .mutation(({ input }) => addTodo(input)),
  toggle: procedure.input(Schema.toStandardSchemaV1(todoIdInputSchema)).mutation(({ input }) => {
    const todo = toggleTodoById(input);
    if (!todo) {
      throw notFound(input.id);
    }
    return todo;
  }),
  delete: procedure.input(Schema.toStandardSchemaV1(todoIdInputSchema)).mutation(({ input }) => {
    if (!deleteTodo(input)) {
      throw notFound(input.id);
    }
    return { id: input.id };
  }),
});
