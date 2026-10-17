import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterOutputs, useTrpc } from '../../api-client';

export type Todo = RouterOutputs['todos']['list'][number];

export type TodosState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'success'; readonly todos: readonly Todo[] };

/** The todos from the api, and the changes that refresh them once the api saves them. */
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todos.list.queryOptions());
  const refreshTodos = () =>
    queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() });
  const create = useMutation(trpc.todos.create.mutationOptions({ onSuccess: refreshTodos }));
  const toggle = useMutation(trpc.todos.toggle.mutationOptions({ onSuccess: refreshTodos }));
  const remove = useMutation(trpc.todos.delete.mutationOptions({ onSuccess: refreshTodos }));

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
    addTodo: (title: Todo['title']) => create.mutate({ title }),
    toggleTodo: (id: Todo['id']) => toggle.mutate({ id }),
    deleteTodo: (id: Todo['id']) => remove.mutate({ id }),
  };
}
