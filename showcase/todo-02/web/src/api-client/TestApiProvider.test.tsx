import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { TestApiProvider } from './TestApiProvider';
import { useTrpc } from './trpc';

function TodosProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.todo.list.queryOptions());
  return <p>{query.error?.message ?? (query.data ? `count ${query.data.length}` : 'waiting')}</p>;
}

it('answers a procedure from its handler', async () => {
  render(
    <TestApiProvider handlers={{ 'todo.list': () => [] }}>
      <TodosProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('count 0')).toBeInTheDocument();
});

it('fails a procedure that the test gave no handler, naming it', async () => {
  render(
    <TestApiProvider handlers={{}}>
      <TodosProbe />
    </TestApiProvider>,
  );

  expect(
    await screen.findByText('TestApiProvider has no handler for todo.list'),
  ).toBeInTheDocument();
});
