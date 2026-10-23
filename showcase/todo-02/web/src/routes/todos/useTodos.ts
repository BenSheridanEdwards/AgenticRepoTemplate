import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterInputs, type RouterOutputs, useTrpc } from '../../api-client';

type TodoId = RouterInputs['todos']['toggle']['id'];
export type Todo = RouterOutputs['todos']['list'][number];

export type TodosState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'success'; readonly todos: readonly Todo[] };

/** The todo list from the api, and the writes that refresh it. */
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todos.list.queryOptions());
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() });
  const add = useMutation(trpc.todos.add.mutationOptions({ onSuccess }));
  const toggle = useMutation(trpc.todos.toggle.mutationOptions({ onSuccess }));
  const remove = useMutation(trpc.todos.delete.mutationOptions({ onSuccess }));

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
    saveFailed: add.isError || toggle.isError || remove.isError,
    addTodo: (title: string) => add.mutate({ title }),
    toggleTodo: (id: TodoId) => toggle.mutate({ id }),
    deleteTodo: (id: TodoId) => remove.mutate({ id }),
  };
}
