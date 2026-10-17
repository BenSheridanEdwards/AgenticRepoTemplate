import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { TestApiProvider } from './TestApiProvider';
import { useTrpc } from './trpc';

function GreetingProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.greeting.greet.queryOptions({ name: 'Ada' }));
  return <p>{query.error?.message ?? query.data?.message ?? 'waiting'}</p>;
}

it('answers a procedure from its handler', async () => {
  render(
    <TestApiProvider handlers={{ 'greeting.greet': ({ name }) => ({ message: `Hi ${name}` }) }}>
      <GreetingProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('Hi Ada')).toBeInTheDocument();
});

it('fails a procedure that the test gave no handler, naming it', async () => {
  render(
    <TestApiProvider handlers={{}}>
      <GreetingProbe />
    </TestApiProvider>,
  );

  expect(
    await screen.findByText('TestApiProvider has no handler for greeting.greet'),
  ).toBeInTheDocument();
});
