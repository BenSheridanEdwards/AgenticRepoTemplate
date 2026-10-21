import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RouterInputs, type RouterOutputs, useTrpc } from '../../api-client';

export type Todo = RouterOutputs['todo']['list'][number];
type Title = RouterInputs['todo']['create']['title'];
type TodoId = RouterInputs['todo']['toggle']['id'];

/** The todos the api holds, with the actions that create, toggle and delete them. */
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.todo.list.queryOptions());

  const refreshTodos = () => queryClient.invalidateQueries({ queryKey: trpc.todo.list.queryKey() });

  const createMutation = useMutation(trpc.todo.create.mutationOptions({ onSuccess: refreshTodos }));
  const toggleMutation = useMutation(trpc.todo.toggle.mutationOptions({ onSuccess: refreshTodos }));
  const removeMutation = useMutation(trpc.todo.remove.mutationOptions({ onSuccess: refreshTodos }));

  function createTodo(title: Title) {
    createMutation.mutate({ title });
  }

  function toggleTodo(id: TodoId) {
    toggleMutation.mutate({ id });
  }

  function removeTodo(id: TodoId) {
    removeMutation.mutate({ id });
  }

  return { todos: query.data ?? [], createTodo, toggleTodo, removeTodo };
}
