import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterOutputs, useTrpc } from '../../api-client';

export type Todo = RouterOutputs['todos']['list'][number];

/** The todos from the api, and the changes a user makes to them. */
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const list = useQuery(trpc.todos.list.queryOptions());
  const refreshList = () => queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() });
  const add = useMutation(trpc.todos.add.mutationOptions({ onSuccess: refreshList }));
  const toggle = useMutation(trpc.todos.toggle.mutationOptions({ onSuccess: refreshList }));
  const remove = useMutation(trpc.todos.delete.mutationOptions({ onSuccess: refreshList }));

  return {
    todos: list.data ?? [],
    loadFailed: list.isError,
    saveFailed: add.isError || toggle.isError || remove.isError,
    addTodo: (title: Todo['title']) => add.mutate({ title }),
    toggleTodo: (id: Todo['id']) => toggle.mutate({ id }),
    deleteTodo: (id: Todo['id']) => remove.mutate({ id }),
  };
}
