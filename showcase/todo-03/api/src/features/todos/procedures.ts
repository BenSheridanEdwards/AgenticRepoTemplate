import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import {
  addTodo,
  deleteTodo,
  listTodos,
  TodoNotFoundError,
  toggleTodoById,
} from './application.ts';

const listInputSchema = Schema.Void;
const createInputSchema = Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) });
const todoInputSchema = Schema.Struct({ id: Schema.String });

function orNotFound<Result>(runUseCase: () => Result): Result {
  try {
    return runUseCase();
  } catch (error) {
    if (error instanceof TodoNotFoundError) {
      throw new TRPCError({ code: 'NOT_FOUND', message: error.message, cause: error });
    }
    throw error;
  }
}

export const todosRouter = router({
  list: procedure.input(Schema.toStandardSchemaV1(listInputSchema)).query(() => listTodos()),
  create: procedure
    .input(Schema.toStandardSchemaV1(createInputSchema))
    .mutation(({ input }) => addTodo(input)),
  toggle: procedure
    .input(Schema.toStandardSchemaV1(todoInputSchema))
    .mutation(({ input }) => orNotFound(() => toggleTodoById(input))),
  delete: procedure
    .input(Schema.toStandardSchemaV1(todoInputSchema))
    .mutation(({ input }) => orNotFound(() => deleteTodo(input))),
});
