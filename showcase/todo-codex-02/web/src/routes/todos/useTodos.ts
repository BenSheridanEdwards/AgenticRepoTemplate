import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterInputs, useTrpc } from '../../api-client';

export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todos.list.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() });
  const create = useMutation(trpc.todos.create.mutationOptions({ onSuccess: refresh }));
  const toggle = useMutation(trpc.todos.toggle.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.todos.delete.mutationOptions({ onSuccess: refresh }));

  return {
    todos: query.data ?? [],
    loading: query.isPending,
    error: query.isError || create.isError || toggle.isError || remove.isError,
    busy: toggle.isPending || remove.isPending,
    createTodo: (title: RouterInputs['todos']['create']['title']) => create.mutateAsync({ title }),
    toggleTodo: (id: string) => toggle.mutate({ id }),
    deleteTodo: (id: string) => remove.mutate({ id }),
  };
}
