import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterOutputs, useTrpc } from '../../api-client';

interface TodosState {
  readonly todos: RouterOutputs['todo']['list'];
  readonly loading: boolean;
  readonly pending: boolean;
  readonly error: { readonly message: string } | null;
  readonly create: (input: { title: string }) => Promise<unknown>;
  readonly toggle: (input: { id: string }) => void;
  readonly remove: (input: { id: string }) => void;
}

export function useTodos(): TodosState {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todo.list.queryOptions());
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: trpc.todo.list.queryKey() });
  const create = useMutation(trpc.todo.create.mutationOptions({ onSuccess }));
  const toggle = useMutation(trpc.todo.toggle.mutationOptions({ onSuccess }));
  const remove = useMutation(trpc.todo.delete.mutationOptions({ onSuccess }));
  return {
    todos: query.data ?? [],
    loading: query.isPending,
    error: query.error ?? create.error ?? toggle.error ?? remove.error,
    create: create.mutateAsync,
    toggle: toggle.mutate,
    remove: remove.mutate,
    pending: create.isPending || toggle.isPending || remove.isPending,
  };
}
