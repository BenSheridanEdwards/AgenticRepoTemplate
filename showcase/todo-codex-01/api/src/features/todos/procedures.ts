import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodo, deleteTodo, listTodos, toggleCompleted } from './application.ts';

const titleInput = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const idInput = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()) });

export const todosRouter = router({
  list: procedure.query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(titleInput))
    .mutation(({ input }) => createTodo(input)),
  toggle: procedure.input(Schema.toStandardSchemaV1(idInput)).mutation(({ input }) => {
    const todo = toggleCompleted(input);
    if (!todo) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Todo not found' });
    }
    return todo;
  }),
  delete: procedure
    .input(Schema.toStandardSchemaV1(idInput))
    .mutation(({ input }) => deleteTodo(input)),
});
