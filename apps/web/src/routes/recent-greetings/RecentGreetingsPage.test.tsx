import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { RecentGreetingsPage } from './RecentGreetingsPage';

function renderPage(list: NonNullable<TestApiHandlers['recentGreetings.list']>) {
  const view = render(
    <TestApiProvider handlers={{ 'recentGreetings.list': list }}>
      <RecentGreetingsPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

it('stays closed and makes no request until asked', () => {
  const list = jest.fn(() => ({ names: ['Ada'] }));
  renderPage(list);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(screen.queryByText('No greetings yet')).not.toBeInTheDocument();
  expect(list).not.toHaveBeenCalled();
});

it('shows the names in server order and refreshes on each later press', async () => {
  const list = jest
    .fn()
    .mockReturnValueOnce({ names: ['Lin', 'Ada'] })
    .mockReturnValueOnce({ names: ['Grace', 'Lin', 'Ada'] });
  const { user, container } = renderPage(list);
  await user.click(screen.getByRole('button', { name: 'Show recent greetings' }));
  expect((await screen.findAllByRole('listitem')).map((item) => item.textContent)).toEqual([
    'Lin',
    'Ada',
  ]);
  await user.click(screen.getByRole('button', { name: 'Show recent greetings' }));
  expect(await screen.findByText('Grace')).toBeVisible();
  expect(list).toHaveBeenCalledTimes(2);
  expect(await axe(container)).toHaveNoViolations();
});

it('shows an empty state when there are no names', async () => {
  const { user } = renderPage(() => ({ names: [] }));
  await user.click(screen.getByRole('button', { name: 'Show recent greetings' }));
  expect(await screen.findByText('No greetings yet')).toBeVisible();
});

it('says so when the api fails', async () => {
  const { user } = renderPage(() => Promise.reject(new Error('api down')));
  await user.click(screen.getByRole('button', { name: 'Show recent greetings' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load recent greetings');
});
