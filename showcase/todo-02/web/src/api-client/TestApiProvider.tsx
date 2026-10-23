import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { TestApiHandlers } from './testApiHandlers';
import { TrpcProvider } from './trpc';
import { useTestApiClients } from './useTestApiClients';

export interface TestApiProviderProps {
  readonly handlers: TestApiHandlers;
  readonly children: ReactNode;
}

/** The app's providers over a typed in-memory api, for route tests. */
export function TestApiProvider({ handlers, children }: TestApiProviderProps) {
  const { queryClient, trpcClient } = useTestApiClients(handlers);
  return (
    <QueryClientProvider client={queryClient}>
      <TrpcProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TrpcProvider>
    </QueryClientProvider>
  );
}
