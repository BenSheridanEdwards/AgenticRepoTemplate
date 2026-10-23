import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrpc } from '../../api-client';
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todos.list.queryOptions());
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() });
  const create = useMutation(trpc.todos.create.mutationOptions({ onSuccess }));
  const toggle = useMutation(trpc.todos.toggle.mutationOptions({ onSuccess }));
  const remove = useMutation(trpc.todos.delete.mutationOptions({ onSuccess }));
  async function addTodo(title: string) {
    try {
      await create.mutateAsync({ title });
    } catch {
      return;
    }
  }
  return {
    todos: query.data ?? [],
    loading: query.isPending,
    error: query.isError || create.isError || toggle.isError || remove.isError,
    pending: create.isPending,
    busy: toggle.isPending || remove.isPending,
    addTodo,
    toggleTodo: (id: string) => toggle.mutate({ id }),
    deleteTodo: (id: string) => remove.mutate({ id }),
  };
}
