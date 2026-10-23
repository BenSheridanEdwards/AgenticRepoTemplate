import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type RouterOutputs, type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodoPage } from './TodoPage';

function renderPage(handlers: TestApiHandlers) {
  return {
    ...render(
      <TestApiProvider handlers={handlers}>
        <TodoPage />
      </TestApiProvider>,
    ),
    user: userEvent.setup(),
  };
}

it('creates, lists, toggles and deletes using the api', async () => {
  let todos: RouterOutputs['todo']['list'] = [];
  const { user } = renderPage({
    'todo.list': () => todos,
    'todo.create': ({ title }) => {
      const todo = { id: 'one', title, completed: false };
      todos = [todo];
      return todo;
    },
    'todo.toggle': ({ id }) => {
      todos = todos.map((todo) => ({ ...todo, completed: !todo.completed }));
      return todos.find((todo) => todo.id === id);
    },
    'todo.delete': ({ id }) => {
      todos = [];
      return { id };
    },
  });
  expect(await screen.findByRole('list', { name: 'Todos' })).toBeVisible();
  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Read  ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'Read' });
  expect(checkbox).not.toBeChecked();
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(''));
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
  await user.click(screen.getByRole('button', { name: 'Delete Read' }));
  await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument());
});

it.each(['', '   '])('rejects blank title %j before calling the api', async (title) => {
  const create = jest.fn();
  const { user } = renderPage({ 'todo.list': () => [], 'todo.create': create });
  if (title) await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(create).not.toHaveBeenCalled();
});

it('shows create failure and keeps the title for retry', async () => {
  const { user } = renderPage({
    'todo.list': () => [],
    'todo.create': () => Promise.reject(new Error('offline')),
  });
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Read');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not add todo');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Read');
});

it('names an unhandled api procedure', async () => {
  renderPage({});
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load or update todos');
});

it.each([
  'toggle',
  'delete',
] as const)('shows %s failure without losing the todo', async (action) => {
  const { user } = renderPage({
    'todo.list': () => [{ id: 'one', title: 'Read', completed: false }],
    'todo.toggle': () => Promise.reject(new Error('offline')),
    'todo.delete': () => Promise.reject(new Error('offline')),
  });
  const checkbox = await screen.findByRole('checkbox', { name: 'Read' });
  await user.click(
    action === 'toggle' ? checkbox : screen.getByRole('button', { name: 'Delete Read' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load or update todos');
  expect(checkbox).not.toBeChecked();
});

it('has no axe violations with a todo listed', async () => {
  const { container } = renderPage({
    'todo.list': () => [{ id: 'one', title: 'Read', completed: true }],
  });
  await screen.findByRole('checkbox', { name: 'Read' });
  expect(await axe(container)).toHaveNoViolations();
});
