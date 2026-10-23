import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { addTodo, deleteTodo, listTodos, toggleTodo } from './application.ts';

const addInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const todoInputSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

function found<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No todo has this id' });
  }
  return value;
}

export const todosRouter = router({
  list: procedure.query(() => listTodos()),
  add: procedure
    .input(Schema.toStandardSchemaV1(addInputSchema))
    .mutation(({ input }) => addTodo(input)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(todoInputSchema))
    .mutation(({ input }) => found(toggleTodo(input))),
  delete: procedure
    .input(Schema.toStandardSchemaV1(todoInputSchema))
    .mutation(({ input }) => found(deleteTodo(input))),
});
