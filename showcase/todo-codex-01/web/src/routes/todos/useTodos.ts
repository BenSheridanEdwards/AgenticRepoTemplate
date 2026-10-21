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

  async function createTodo(title: string) {
    await create.mutateAsync({ title }).catch(() => undefined);
  }
  return {
    todos: query.data ?? [],
    isLoading: query.isPending,
    isError: query.isError || create.isError || toggle.isError || remove.isError,
    isSaving: toggle.isPending || remove.isPending,
    createTodo,
    toggleTodo: (id: string) => toggle.mutate({ id }),
    deleteTodo: (id: string) => remove.mutate({ id }),
  };
}
