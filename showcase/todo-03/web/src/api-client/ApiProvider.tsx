import { QueryClientProvider } from '@tanstack/react-query';
import type { AppRouter } from '@todo-03/api';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { ReactNode } from 'react';
import { createQueryClient, TrpcProvider } from './trpc';

const queryClient = createQueryClient();
const trpcClient = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: '/trpc' })] });

export function ApiProvider({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TrpcProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TrpcProvider>
    </QueryClientProvider>
  );
}
