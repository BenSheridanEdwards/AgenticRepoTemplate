import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterOutputs, useTrpc } from '../../api-client';

export type Todo = RouterOutputs['todo']['list'][number];

/** The todos held by the api, with the actions that change them. */
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const todosQuery = useQuery(trpc.todo.list.queryOptions());
  const refreshList = () => queryClient.invalidateQueries({ queryKey: trpc.todo.list.queryKey() });
  const createMutation = useMutation(trpc.todo.create.mutationOptions({ onSuccess: refreshList }));
  const toggleMutation = useMutation(trpc.todo.toggle.mutationOptions({ onSuccess: refreshList }));
  const deleteMutation = useMutation(trpc.todo.delete.mutationOptions({ onSuccess: refreshList }));

  return {
    todos: todosQuery.data ?? [],
    createTodo: (title: string) => createMutation.mutate({ title }),
    toggleTodo: (id: Todo['id']) => toggleMutation.mutate({ id }),
    deleteTodo: (id: Todo['id']) => deleteMutation.mutate({ id }),
  };
}
