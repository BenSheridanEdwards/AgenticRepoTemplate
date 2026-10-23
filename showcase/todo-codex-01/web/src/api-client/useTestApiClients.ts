import type { QueryClient } from '@tanstack/react-query';
import type { AppRouter } from '@todo-codex-01/api';
import { createTRPCClient, type TRPCClient } from '@trpc/client';
import { useState } from 'react';
import { handlerLink, type TestApiHandlers } from './testApiHandlers';
import { createQueryClient } from './trpc';

/** One query client and one handler-backed tRPC client for the life of a test render. */
export function useTestApiClients(handlers: TestApiHandlers): {
  readonly queryClient: QueryClient;
  readonly trpcClient: TRPCClient<AppRouter>;
} {
  const [clients] = useState(() => ({
    queryClient: createQueryClient(),
    trpcClient: createTRPCClient<AppRouter>({ links: [handlerLink(handlers)] }),
  }));
  return clients;
}
