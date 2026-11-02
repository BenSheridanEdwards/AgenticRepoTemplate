import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatchersV3, PactV4 } from '@pact-foundation/pact';
import { createTrpcClient } from './trpc';

const pact = new PactV4({
  consumer: 'web',
  provider: 'api',
  dir: process.env.PACT_DIR ?? join(tmpdir(), 'art-pact'),
});

it('greeting.greet returns the batch response the web consumes', async () => {
  await pact
    .addInteraction()
    .uponReceiving('greeting.greet for Ada')
    .withRequest('GET', '/trpc/greeting.greet', (request) => {
      request.query({ batch: '1', input: JSON.stringify({ 0: { name: 'Ada' } }) });
    })
    .willRespondWith(200, (response) => {
      response.jsonBody([{ result: { data: { message: 'Hello, Ada!' } } }]);
    })
    .executeTest(async (server) => {
      await expect(
        createTrpcClient(`${server.url}/trpc`).greeting.greet.query({ name: 'Ada' }),
      ).resolves.toEqual({ message: 'Hello, Ada!' });
    });
});

it('greeting.greet rejects blank names with the tRPC error envelope', async () => {
  const { like } = MatchersV3;
  await pact
    .addInteraction()
    .uponReceiving('greeting.greet with a blank name')
    .withRequest('GET', '/trpc/greeting.greet', (request) => {
      request.query({ batch: '1', input: JSON.stringify({ 0: { name: '   ' } }) });
    })
    .willRespondWith(400, (response) => {
      response.jsonBody([
        {
          error: {
            message: like('Invalid name'),
            code: -32600,
            data: {
              code: 'BAD_REQUEST',
              httpStatus: 400,
              stack: like('Error'),
              path: like('greeting.greet'),
            },
          },
        },
      ]);
    })
    .executeTest(async (server) => {
      await expect(
        createTrpcClient(`${server.url}/trpc`).greeting.greet.query({ name: '   ' }),
      ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    });
});
