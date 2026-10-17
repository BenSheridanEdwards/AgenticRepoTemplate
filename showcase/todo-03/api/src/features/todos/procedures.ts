import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { addTodo, deleteTodo, listTodos, toggleTodo } from './application.ts';
import type { Todo } from './domain.ts';

const createInputSchema = Schema.Struct({ title: Schema.Trim.pipe(Schema.nonEmptyString()) });
const todoIdInputSchema = Schema.Struct({ id: Schema.String.pipe(Schema.nonEmptyString()) });

function notFound(id: string): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: `No todo has the id ${id}` });
}

export const todosRouter = router({
  list: procedure.query(() => listTodos()),
  create: procedure
    .input(Schema.standardSchemaV1(createInputSchema))
    .mutation(({ input }) => addTodo(input)),
  toggle: procedure
    .input(Schema.standardSchemaV1(todoIdInputSchema))
    .mutation(({ input }): Todo => {
      const todo = toggleTodo(input);
      if (!todo) {
        throw notFound(input.id);
      }
      return todo;
    }),
  delete: procedure
    .input(Schema.standardSchemaV1(todoIdInputSchema))
    .mutation(({ input }): { readonly id: string } => {
      if (!deleteTodo(input)) {
        throw notFound(input.id);
      }
      return { id: input.id };
    }),
});
