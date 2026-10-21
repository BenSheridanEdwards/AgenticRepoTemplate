import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterOutputs, useTrpc } from '../../api-client';

export type Todo = RouterOutputs['todo']['list'][number];

/** The todo list and the create, toggle and delete actions, all through the api. */
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const todosQuery = useQuery(trpc.todo.list.queryOptions());

  const refreshTodos = () => queryClient.invalidateQueries({ queryKey: trpc.todo.list.queryKey() });

  const createMutation = useMutation(trpc.todo.create.mutationOptions({ onSuccess: refreshTodos }));
  const toggleMutation = useMutation(trpc.todo.toggle.mutationOptions({ onSuccess: refreshTodos }));
  const deleteMutation = useMutation(trpc.todo.delete.mutationOptions({ onSuccess: refreshTodos }));

  return {
    todos: todosQuery.data ?? [],
    addTodo: (title: string) => createMutation.mutate({ title }),
    toggleTodo: (id: string) => toggleMutation.mutate({ id }),
    deleteTodo: (id: string) => deleteMutation.mutate({ id }),
  };
}
