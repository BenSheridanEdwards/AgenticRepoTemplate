import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createQueryClient, createTrpcClient, TrpcProvider } from './trpc';

const queryClient = createQueryClient();
const trpcClient = createTrpcClient();

export function ApiProvider({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TrpcProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TrpcProvider>
    </QueryClientProvider>
  );
}
