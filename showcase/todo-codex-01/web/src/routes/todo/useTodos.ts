import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterOutputs, useTrpc } from '../../api-client';

interface TodosState {
  readonly todos: RouterOutputs['todo']['list'];
  readonly loading: boolean;
  readonly error: { readonly message: string } | null;
  readonly create: {
    readonly mutateAsync: (input: { title: string }) => Promise<unknown>;
    readonly isPending: boolean;
  };
  readonly toggle: {
    readonly mutate: (input: { id: string }) => void;
    readonly isPending: boolean;
  };
  readonly remove: {
    readonly mutate: (input: { id: string }) => void;
    readonly isPending: boolean;
  };
}
export function useTodos(): TodosState {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todo.list.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.todo.list.queryKey() });
  const create = useMutation(trpc.todo.create.mutationOptions({ onSuccess: refresh }));
  const toggle = useMutation(trpc.todo.toggle.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.todo.delete.mutationOptions({ onSuccess: refresh }));
  return {
    todos: query.data ?? [],
    loading: query.isPending,
    error: query.error ?? create.error ?? toggle.error ?? remove.error,
    create,
    toggle,
    remove,
  };
}
