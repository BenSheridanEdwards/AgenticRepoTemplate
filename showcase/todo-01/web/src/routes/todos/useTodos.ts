import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterInputs, type RouterOutputs, useTrpc } from '../../api-client';

type Todo = RouterOutputs['todos']['list'][number];
type TodoId = RouterInputs['todos']['toggle']['id'];

export type TodosState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'success'; readonly todos: readonly Todo[] };

/** The todo list from the api, and the changes that refresh it once saved. */
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todos.list.queryOptions());
  const refreshList = {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() }),
  };
  const create = useMutation(trpc.todos.create.mutationOptions(refreshList));
  const toggle = useMutation(trpc.todos.toggle.mutationOptions(refreshList));
  const remove = useMutation(trpc.todos.delete.mutationOptions(refreshList));

  let todos: TodosState;
  if (query.isError) {
    todos = { status: 'error' };
  } else if (query.data) {
    todos = { status: 'success', todos: query.data };
  } else {
    todos = { status: 'loading' };
  }

  return {
    todos,
    saveFailed: create.isError || toggle.isError || remove.isError,
    createTodo: (title: Todo['title']) => create.mutate({ title }),
    toggleTodo: (id: TodoId) => toggle.mutate({ id }),
    deleteTodo: (id: TodoId) => remove.mutate({ id }),
  };
}
