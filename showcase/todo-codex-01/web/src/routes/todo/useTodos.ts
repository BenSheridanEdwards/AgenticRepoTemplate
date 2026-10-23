import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrpc } from '../../api-client';

export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const todos = useQuery(trpc.todo.list.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.todo.list.queryKey() });
  const create = useMutation(trpc.todo.create.mutationOptions({ onSuccess: refresh }));
  const toggle = useMutation(trpc.todo.toggle.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.todo.delete.mutationOptions({ onSuccess: refresh }));
  return {
    todos: todos.data ?? [],
    loading: todos.isPending,
    error: todos.isError || toggle.isError || remove.isError,
    busy: toggle.isPending || remove.isPending,
    createTodo: (title: string) => create.mutateAsync({ title }),
    toggleTodo: (id: string) => toggle.mutate({ id }),
    deleteTodo: (id: string) => remove.mutate({ id }),
  };
}
