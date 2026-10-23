import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterOutputs, useTrpc } from '../../api-client';

interface TodoMutation<Input, Output> {
  readonly mutate: (input: Input) => void;
  readonly mutateAsync: (input: Input) => Promise<Output>;
  readonly isPending: boolean;
  readonly isError: boolean;
}
interface TodosState {
  readonly query: {
    readonly data: RouterOutputs['todos']['list'] | undefined;
    readonly isPending: boolean;
    readonly isError: boolean;
  };
  readonly create: TodoMutation<{ title: string }, RouterOutputs['todos']['create']>;
  readonly toggle: TodoMutation<{ id: string }, RouterOutputs['todos']['toggle']>;
  readonly remove: TodoMutation<{ id: string }, RouterOutputs['todos']['delete']>;
}
export function useTodos(): TodosState {
  const trpc = useTrpc();
  const client = useQueryClient();
  const query = useQuery(trpc.todos.list.queryOptions());
  const onSuccess = () => client.invalidateQueries({ queryKey: trpc.todos.list.queryKey() });
  const create = useMutation(trpc.todos.create.mutationOptions({ onSuccess }));
  const toggle = useMutation(trpc.todos.toggle.mutationOptions({ onSuccess }));
  const remove = useMutation(trpc.todos.delete.mutationOptions({ onSuccess }));
  return { query, create, toggle, remove };
}
