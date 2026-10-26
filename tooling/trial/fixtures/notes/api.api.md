# Notes API fixture

```ts
export declare const appRouter: TRPCBuiltRouter<{}, DecorateCreateRouterOptions<{
    list: TRPCQueryProcedure<{
        input: void;
        output: { id: string; title: string; body: string }[];
    }>;
    create: TRPCMutationProcedure<{
        input: { title: string; body: string };
        output: { id: string; title: string; body: string };
    }>;
    delete: TRPCMutationProcedure<{
        input: { id: string };
        output: { id: string };
    }>;
}>>;
```
