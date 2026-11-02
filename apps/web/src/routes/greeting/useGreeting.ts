import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type RouterInputs, type RouterOutputs, useTrpc } from '../../api-client';

type GreetInput = RouterInputs['greeting']['greet'];
type Greeting = RouterOutputs['greeting']['greet'];

export type GreetingState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly message: Greeting['message'] }
  | { readonly status: 'error' };

/** The greeting for the last submitted name, fetched through the api. */
export function useGreeting() {
  const [name, setName] = useState<GreetInput['name'] | null>(null);
  const trpc = useTrpc();
  const query = useQuery({
    ...trpc.greeting.greet.queryOptions(name === null ? skipToken : { name }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (name !== null && !query.isFetching && query.isSuccess && query.dataUpdatedAt > 0) {
      void queryClient
        .getMutationCache()
        .build(queryClient, trpc.recentGreetings.record.mutationOptions())
        .execute({ name: name.trim() })
        .catch(() => undefined);
    }
  }, [name, query.isFetching, query.isSuccess, query.dataUpdatedAt, queryClient, trpc]);

  function requestGreeting(nextName: GreetInput['name']) {
    setName(nextName);
    if (nextName === name) {
      void query.refetch();
    }
  }

  let greeting: GreetingState;
  if (name === null) {
    greeting = { status: 'idle' };
  } else if (query.isFetching) {
    greeting = { status: 'loading' };
  } else if (query.isError) {
    greeting = { status: 'error' };
  } else if (query.data) {
    greeting = { status: 'success', message: query.data.message };
  } else {
    greeting = { status: 'loading' };
  }
  return { greeting, requestGreeting };
}
