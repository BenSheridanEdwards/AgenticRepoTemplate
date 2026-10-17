import type { AppRouter } from '@repo/api';
import { QueryClient } from '@tanstack/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// The annotations name the exported types through AppRouter, so declaration
// emit (pnpm api:report) never reaches into the api's source files. Biome
// useNamingConvention runs with strictCase, so the bindings drop the all-caps
// acronym.
type TrpcContext = ReturnType<typeof createTRPCContext<AppRouter>>;
const trpcContext: TrpcContext = createTRPCContext<AppRouter>();
export const TrpcProvider: TrpcContext['TRPCProvider'] = trpcContext.TRPCProvider;
export const useTrpc: TrpcContext['useTRPC'] = trpcContext.useTRPC;

/** A failed request shows its error at once; the user retries by submitting again. */
export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
