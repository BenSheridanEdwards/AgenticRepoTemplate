import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../../trpc.ts';
import { greetingRouter } from './procedures.ts';

const caller = createCallerFactory(greetingRouter)({});

it('trims the name and greets it', async () => {
  await expect(caller.greet({ name: '  Ada ' })).resolves.toEqual({ message: 'Hello, Ada!' });
});

it.each(['', '   '])('rejects the blank name %j as a bad request', async (name) => {
  await expect(caller.greet({ name })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'BAD_REQUEST',
  });
});
