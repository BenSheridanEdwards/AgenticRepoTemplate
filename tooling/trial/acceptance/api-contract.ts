import { randomUUID } from 'node:crypto';
import { type APIResponse, expect, test } from '@playwright/test';

type MutationInput = { id: string } | { title: string; body?: string };

async function success(response: APIResponse) {
  expect(response.status()).toBe(200);
  const body = await response.json();

  expect(body).toEqual([{ result: { data: expect.anything() } }]);

  return body[0].result.data;
}

export function apiContract(brief: 'todo' | 'notes') {
  const router = brief === 'todo' ? 'todos' : 'notes';

  const listedItem = {
    id: expect.any(String),
    title: expect.any(String),
    ...(brief === 'todo' ? { completed: expect.any(Boolean) } : { body: expect.any(String) }),
  };

  test.describe(`${brief} API contract`, () => {
    (brief === 'notes' ? ['', '  Keep this body  '] : ['']).forEach((body) => {
      test(`returns exact list/create/toggle/delete bodies over /trpc ${JSON.stringify(body)}`, async ({
        request,
      }) => {
        const title = `API ${randomUUID()}`;

        const input =
          brief === 'notes' ? { title: `  ${title}  `, body } : { title: `  ${title}  ` };

        const mutate = (name: string, value: MutationInput) =>
          request.post(`/trpc/${router}.${name}?batch=1`, { data: { 0: value } });

        const list = async () => {
          const items = await success(await request.get(`/trpc/${router}.list?batch=1`));

          expect(items).toEqual(expect.any(Array));
          expect(items).toEqual(items.map(() => listedItem));

          return items;
        };

        const item = await success(await mutate('create', input));

        expect(item).toEqual({
          id: expect.any(String),
          title,
          ...(brief === 'todo' ? { completed: false } : { body }),
        });
        expect(await list()).toContainEqual(item);

        if (brief === 'todo') {
          expect(await success(await mutate('toggle', { id: item.id }))).toEqual({
            ...item,
            completed: true,
          });
          expect(await list()).toContainEqual({ ...item, completed: true });
          expect(await success(await mutate('toggle', { id: item.id }))).toEqual(item);
          expect(await list()).toContainEqual(item);
        }

        expect(await success(await mutate('delete', { id: item.id }))).toEqual({ id: item.id });
        expect(await list()).not.toContainEqual(expect.objectContaining({ id: item.id }));
      });
    });

    const mutations = brief === 'todo' ? ['toggle', 'delete'] : ['delete'];
    const body = brief === 'notes' ? { body: '' } : {};

    const invalidInputs = [
      {
        name: 'create',
        inputs: [
          {},
          { title: ' ', ...body },
          { title: 42, ...body },
          ...(brief === 'notes'
            ? [{ title: 'Body required' }, { title: 'Wrong body', body: 42 }]
            : []),
        ],
      },
      ...mutations.map((name) => ({ name, inputs: [{}, { id: 42 }] })),
    ];

    invalidInputs.forEach(({ name, inputs }) => {
      test(`${name} rejects malformed inputs`, async ({ request }) => {
        await Promise.all(
          inputs.map(async (input) => {
            const response = await request.post(`/trpc/${router}.${name}?batch=1`, {
              data: { 0: input },
            });

            expect(response.status()).toBe(400);
            expect(await response.json()).toEqual([
              {
                error: expect.objectContaining({
                  code: -32600,
                  data: expect.objectContaining({ code: 'BAD_REQUEST', httpStatus: 400 }),
                }),
              },
            ]);
          }),
        );
      });
    });
  });
}
