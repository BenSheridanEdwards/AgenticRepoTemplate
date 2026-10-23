import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { type TestApiHandlers, TestApiProvider } from './index';
import { useTrpc } from './trpc';

function TodoProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.todo.list.queryOptions());
  return <p>{query.error?.message ?? query.data?.[0]?.title ?? 'waiting'}</p>;
}

it('answers a procedure from its handler', async () => {
  render(
    <TestApiProvider
      handlers={{ 'todo.list': () => [{ id: '1', title: 'Hi Ada', completed: false }] }}
    >
      <TodoProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('Hi Ada')).toBeInTheDocument();
});

it('fails a procedure that the test gave no handler, naming it', async () => {
  render(
    <TestApiProvider handlers={{} satisfies TestApiHandlers}>
      <TodoProbe />
    </TestApiProvider>,
  );

  expect(
    await screen.findByText('TestApiProvider has no handler for todo.list'),
  ).toBeInTheDocument();
});
