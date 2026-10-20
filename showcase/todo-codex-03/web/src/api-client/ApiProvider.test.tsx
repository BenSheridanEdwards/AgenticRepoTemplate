import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ApiProvider } from './ApiProvider';
import { useTrpc } from './trpc';

function TodoProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.todos.list.queryOptions());
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
    json: async () => [
      { result: { data: [{ id: 'one', title: 'Hello, Ada!', completed: false }] } },
    ],
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  render(
    <ApiProvider>
      <TodoProbe />
    </ApiProvider>,
  );

  expect(await screen.findByText('Hello, Ada!')).toBeInTheDocument();
  const [url] = fetchMock.mock.calls[0] ?? [''];
  expect(String(url)).toMatch(/^\/trpc\/todos\.list\?batch=1&input=/);
});
