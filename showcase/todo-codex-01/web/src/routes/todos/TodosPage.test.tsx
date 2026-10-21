import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

function renderPage(handlers: TestApiHandlers = {}) {
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

it('creates, toggles in both directions and deletes through the api', async () => {
  let todos: { id: string; title: string; completed: boolean }[] = [];
  const { user } = renderPage({
    'todos.list': () => todos,
    'todos.create': ({ title }) => {
      const todo = { id: 'one', title, completed: false };
      todos = [todo];
      return todo;
    },
    'todos.toggle': ({ id }) => {
      const todo = { id, title: 'Read', completed: !todos[0]?.completed };
      todos = [todo];
      return todo;
    },
    'todos.delete': () => {
      todos = [];
      return true;
    },
  });
  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Read  ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'Read' });
  expect(checkbox).not.toBeChecked();
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
  await user.click(screen.getByRole('button', { name: 'Delete Read' }));
  await waitFor(() => expect(checkbox).not.toBeInTheDocument());
});

it.each(['', '   '])('rejects a blank title %j without creating', async (title) => {
  const create = jest.fn();
  const { user, container } = renderPage({ 'todos.list': () => [], 'todos.create': create });
  if (title) await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(create).not.toHaveBeenCalled();
  expect(await axe(container)).toHaveNoViolations();
});

it('shows a load failure', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('offline')) });
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load todos');
});

it('shows a create failure', async () => {
  const { user } = renderPage({
    'todos.list': () => [],
    'todos.create': () => Promise.reject(new Error('offline')),
  });
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Read');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load todos');
});

it.each(['toggle', 'delete'] as const)('shows a %s failure', async (action) => {
  const fail = () => Promise.reject(new Error('offline'));
  const { user } = renderPage({
    'todos.list': () => [{ id: 'one', title: 'Read', completed: false }],
    'todos.toggle': fail,
    'todos.delete': fail,
  });
  await screen.findByRole('checkbox', { name: 'Read' });
  await user.click(
    action === 'toggle'
      ? screen.getByRole('checkbox', { name: 'Read' })
      : screen.getByRole('button', { name: 'Delete Read' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load todos');
});
