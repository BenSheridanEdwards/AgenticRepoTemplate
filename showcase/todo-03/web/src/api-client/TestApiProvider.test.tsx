import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { TestApiProvider } from './TestApiProvider';
import { useTrpc } from './trpc';

function TodosProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.todos.list.queryOptions());
  return <p>{query.error?.message ?? query.data?.[0]?.title ?? 'waiting'}</p>;
}

it('answers a procedure from its handler', async () => {
  render(
    <TestApiProvider
      handlers={{ 'todos.list': () => [{ id: '1', title: 'Buy milk', completed: false }] }}
    >
      <TodosProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('Buy milk')).toBeInTheDocument();
});

it('fails a procedure that the test gave no handler, naming it', async () => {
  render(
    <TestApiProvider handlers={{}}>
      <TodosProbe />
    </TestApiProvider>,
  );

  expect(
    await screen.findByText('TestApiProvider has no handler for todos.list'),
  ).toBeInTheDocument();
});
