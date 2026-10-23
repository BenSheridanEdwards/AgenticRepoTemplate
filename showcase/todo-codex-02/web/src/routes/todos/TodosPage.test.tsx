import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type RouterOutputs, type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

function renderPage(handlers: TestApiHandlers) {
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

it('creates, toggles in both directions and deletes through the api', async () => {
  let todos: RouterOutputs['todos']['list'] = [];
  const { user, container } = renderPage({
    'todos.list': () => todos,
    'todos.create': ({ title }) => {
      const todo = { id: 'one', title, completed: false };
      todos = [...todos, todo];
      return todo;
    },
    'todos.toggle': ({ id }) => {
      const todo = { id, title: 'Read', completed: !todos[0]?.completed };
      todos = [todo];
      return todo;
    },
    'todos.delete': () => {
      todos = [];
      return { success: true };
    },
  });
  await screen.findByRole('list', { name: 'Todos' });
  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Read  ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'Read' });
  expect(checkbox).not.toBeChecked();
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
  expect(await axe(container)).toHaveNoViolations();
  await user.click(screen.getByRole('button', { name: 'Delete Read' }));
  await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument());
});

it.each(['', '   '])('rejects blank title %j', async (title) => {
  const create = jest.fn();
  const { user } = renderPage({ 'todos.list': () => [], 'todos.create': create });
  if (title) {
    await user.type(screen.getByRole('textbox'), title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(create).not.toHaveBeenCalled();
});

it('shows loading and then a query failure', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('offline')) });
  expect(screen.getByRole('status')).toHaveTextContent('Loading todos');
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load todos');
});

it('reports a create failure and keeps the title for retry', async () => {
  const { user } = renderPage({
    'todos.list': () => [],
    'todos.create': () => Promise.reject(new Error('offline')),
  });
  await user.type(screen.getByRole('textbox'), 'Read');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save todo');
  expect(screen.getByRole('textbox')).toHaveValue('Read');
});

it.each(['toggle', 'delete'] as const)('reports a %s failure', async (operation) => {
  const { user } = renderPage({
    'todos.list': () => [{ id: 'one', title: 'Read', completed: false }],
    'todos.toggle': () => Promise.reject(new Error('offline')),
    'todos.delete': () => Promise.reject(new Error('offline')),
  });
  await screen.findByRole('checkbox');
  await user.click(
    operation === 'toggle'
      ? screen.getByRole('checkbox')
      : screen.getByRole('button', { name: 'Delete Read' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save todo');
});
