import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterInputs, type RouterOutputs, useTrpc } from '../../api-client';

interface TodosState {
  readonly todos: RouterOutputs['todos']['list'];
  readonly loading: boolean;
  readonly error: { readonly message: string } | null;
  readonly create: (title: RouterInputs['todos']['create']['title']) => Promise<boolean>;
  readonly toggle: (id: string) => void;
  readonly deleteTodo: (id: string) => void;
  readonly saving: boolean;
}

export function useTodos(): TodosState {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todos.list.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() });
  const creation = useMutation(trpc.todos.create.mutationOptions({ onSuccess: refresh }));
  const completion = useMutation(trpc.todos.toggle.mutationOptions({ onSuccess: refresh }));
  const deletion = useMutation(trpc.todos.delete.mutationOptions({ onSuccess: refresh }));

  async function create(title: string) {
    try {
      await creation.mutateAsync({ title });
      return true;
    } catch {
      return false;
    }
  }

  return {
    todos: query.data ?? [],
    loading: query.isPending,
    error: query.error ?? creation.error ?? completion.error ?? deletion.error,
    create,
    toggle: (id: string) => completion.mutate({ id }),
    deleteTodo: (id: string) => deletion.mutate({ id }),
    saving: completion.isPending || deletion.isPending,
  };
}
