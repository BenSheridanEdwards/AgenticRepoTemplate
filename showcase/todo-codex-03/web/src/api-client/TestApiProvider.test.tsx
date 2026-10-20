import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { TestApiProvider } from './TestApiProvider';
import { useTrpc } from './trpc';

function TodoProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.todos.list.queryOptions());
  return <p>{query.error?.message ?? query.data?.[0]?.title ?? 'waiting'}</p>;
}

it('answers a procedure from its handler', async () => {
  render(
    <TestApiProvider
      handlers={{ 'todos.list': () => [{ id: 'one', title: 'Hi Ada', completed: false }] }}
    >
      <TodoProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('Hi Ada')).toBeInTheDocument();
});

it('fails a procedure that the test gave no handler, naming it', async () => {
  render(
    <TestApiProvider handlers={{}}>
      <TodoProbe />
    </TestApiProvider>,
  );

  expect(
    await screen.findByText('TestApiProvider has no handler for todos.list'),
  ).toBeInTheDocument();
});
