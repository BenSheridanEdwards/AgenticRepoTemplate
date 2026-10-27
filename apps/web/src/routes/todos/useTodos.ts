import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrpc } from '../../api-client';

export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todos.list.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() });
  const create = useMutation(trpc.todos.create.mutationOptions({ onSuccess: refresh }));
  const toggle = useMutation(trpc.todos.toggle.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.todos.delete.mutationOptions({ onSuccess: refresh }));

  async function addTodo(title: string) {
    await create.mutateAsync({ title });
  }

  return {
    todos: query.data ?? [],
    isLoading: query.isPending,
    loadError: query.isError,
    changeError: toggle.isError || remove.isError,
    isChanging: toggle.isPending || remove.isPending,
    addTodo,
    toggleTodo: (id: string) => toggle.mutate({ id }),
    deleteTodo: (id: string) => remove.mutate({ id }),
  };
}
