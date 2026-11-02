import { createCallerFactory } from '../../trpc.ts';
import { recentGreetingsRouter } from './procedures.ts';

const caller = createCallerFactory(recentGreetingsRouter)({});

it('records a valid name and lists it', async () => {
  await caller.record({ name: 'Ada' });
  await expect(caller.list()).resolves.toEqual({ names: expect.arrayContaining(['Ada']) });
});

it('trims a name before recording it', async () => {
  await expect(caller.record({ name: '  Lin  ' })).resolves.toMatchObject({
    names: expect.arrayContaining(['Lin']),
  });
});

it.each(['', '   '])('rejects the blank name %j as a bad request', async (name) => {
  await expect(caller.record({ name })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
