import type { AppRouter } from '@repo/api';
import { type Operation, TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { RouterInputs, RouterOutputs } from './trpc';

type ProcedurePath = {
  [Router in keyof RouterInputs & string]: `${Router}.${keyof RouterInputs[Router] & string}`;
}[keyof RouterInputs & string];

type Lookup<Tree, Path> = Path extends `${infer Router}.${infer Procedure}`
  ? Router extends keyof Tree
    ? Procedure extends keyof Tree[Router]
      ? Tree[Router][Procedure]
      : never
    : never
  : never;

/** A fake answer per procedure path, such as `'greeting.greet'`, typed by the router. */
export type TestApiHandlers = {
  readonly [Path in ProcedurePath]?: (
    input: Lookup<RouterInputs, Path>,
  ) => Lookup<RouterOutputs, Path> | Promise<Lookup<RouterOutputs, Path>>;
};

// The typed tRPC client pairs each path with its input before the link erases it.
// Method variance lets this dispatch interface accept each procedure's handler.
interface TestApiHandler {
  handle(
    input: Operation['input'],
  ): Lookup<RouterOutputs, ProcedurePath> | Promise<Lookup<RouterOutputs, ProcedurePath>>;
}

/** A tRPC link that answers each call from `handlers` instead of the network. */
export function handlerLink(handlers: TestApiHandlers): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        const handler: TestApiHandler['handle'] | undefined = Object.entries(handlers).find(
          ([path]) => path === op.path,
        )?.[1];
        Promise.resolve(op.input)
          .then((input) => {
            if (!handler) {
              throw new Error(`TestApiProvider has no handler for ${op.path}`);
            }
            return handler(input);
          })
          .then(
            (data) => {
              observer.next({ result: { type: 'data', data } });
              observer.complete();
            },
            (cause: Error) => observer.error(TRPCClientError.from(cause)),
          );
      });
}
