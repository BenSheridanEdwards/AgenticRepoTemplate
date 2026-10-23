import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { addTodo, deleteTodo, listTodos, toggleCompleted } from './application.ts';

const titleSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idSchema = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

export const todosRouter = router({
  list: procedure.query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(titleSchema))
    .mutation(({ input }) => addTodo(input.title)),
  toggle: procedure.input(Schema.toStandardSchemaV1(idSchema)).mutation(({ input }) => {
    const todo = toggleCompleted(input.id);
    if (!todo) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Todo not found' });
    }
    return todo;
  }),
  delete: procedure
    .input(Schema.toStandardSchemaV1(idSchema))
    .mutation(({ input }) => deleteTodo(input.id)),
});
