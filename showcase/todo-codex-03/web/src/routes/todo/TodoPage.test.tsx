import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type RouterOutputs, TestApiProvider } from '../../api-client';
import { TodoPage } from './TodoPage';

function renderPage(fail = false) {
  let todos: RouterOutputs['todo']['list'] = [];
  const view = render(
    <TestApiProvider
      handlers={{
        'todo.list': () => todos,
        'todo.create': ({ title }) => {
          if (fail) throw new Error('offline');
          const todo = { id: '1', title, completed: false };
          todos = [todo];
          return todo;
        },
        'todo.toggle': ({ id }) => {
          todos = todos.map((todo) => ({ ...todo, completed: !todo.completed }));
          return todos.find((todo) => todo.id === id) ?? null;
        },
        'todo.delete': () => {
          todos = [];
          return null;
        },
      }}
    >
      <TodoPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

it('validates, creates, toggles and deletes through the api', async () => {
  const { user, container } = renderPage();
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Read');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'Read' });
  expect(checkbox).not.toBeChecked();
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  expect(await axe(container)).toHaveNoViolations();
  await user.click(screen.getByRole('button', { name: 'Delete Read' }));
  await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox')).toHaveValue('');
});

it('shows save failures and preserves the title for retry', async () => {
  const { user } = renderPage(true);
  await user.type(screen.getByRole('textbox'), 'Keep');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load');
  expect(screen.getByRole('textbox')).toHaveValue('Keep');
});
