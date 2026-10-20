import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ApiProvider } from './ApiProvider';
import { useTrpc } from './trpc';

function TodoProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.todo.list.queryOptions());
  return <p>{query.data?.[0]?.title ?? 'waiting'}</p>;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

it('sends procedure calls to /trpc on the same origin and reads the answer', async () => {
  const fetchMock = jest.fn(async (_url: string) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => [{ result: { data: [{ id: '1', title: 'Buy milk', completed: false }] } }],
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  render(
    <ApiProvider>
      <TodoProbe />
    </ApiProvider>,
  );

  expect(await screen.findByText('Buy milk')).toBeInTheDocument();
  const [url] = fetchMock.mock.calls[0] ?? [''];
  expect(String(url)).toMatch(/^\/trpc\/todo\.list\?batch=1/);
});
