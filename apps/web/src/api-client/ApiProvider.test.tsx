import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ApiProvider } from './ApiProvider';
import { useTrpc } from './trpc';

function GreetingProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.greeting.greet.queryOptions({ name: 'Ada' }));
  return <p>{query.data?.message ?? 'waiting'}</p>;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

it('sends procedure calls to /trpc on the same origin and reads the answer', async () => {
  // jsdom omits Response; use Node's native implementation from its own realm.
  const NodeResponse: typeof Response = jest.requireActual('node:vm').runInThisContext('Response');
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      new NodeResponse(JSON.stringify([{ result: { data: { message: 'Hello, Ada!' } } }]), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  globalThis.fetch = fetchMock;

  render(
    <ApiProvider>
      <GreetingProbe />
    </ApiProvider>,
  );

  expect(await screen.findByText('Hello, Ada!')).toBeInTheDocument();
  const [url] = fetchMock.mock.calls[0] ?? [''];
  expect(String(url)).toMatch(/^\/trpc\/greeting\.greet\?batch=1&input=/);
});
