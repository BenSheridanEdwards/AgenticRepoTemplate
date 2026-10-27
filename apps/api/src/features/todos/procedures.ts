import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { addTodo, deleteTodo, listTodos, toggleTodo } from './application.ts';

const createInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idInputSchema = Schema.Struct({ id: Schema.Trim.check(Schema.isNonEmpty()) });

export const todosRouter = router({
  list: procedure.query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(createInputSchema))
    .mutation(({ input }) => addTodo(input.title)),
  toggle: procedure.input(Schema.toStandardSchemaV1(idInputSchema)).mutation(({ input }) => {
    const todo = toggleTodo(input.id);
    if (!todo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Todo not found' });
    return todo;
  }),
  delete: procedure
    .input(Schema.toStandardSchemaV1(idInputSchema))
    .mutation(({ input }) => deleteTodo(input.id)),
});
