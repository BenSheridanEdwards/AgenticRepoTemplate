import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type RouterOutputs, type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodoPage } from './TodoPage';

function renderPage(overrides: TestApiHandlers = {}) {
  let todos: RouterOutputs['todos']['list'] = [];
  const handlers: TestApiHandlers = {
    'todos.list': () => todos,
    'todos.create': ({ title }) => {
      const todo = { id: '1', title, completed: false };
      todos = [...todos, todo];
      return todo;
    },
    'todos.toggle': ({ id }) => {
      todos = todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      );
      return todos[0] ?? null;
    },
    'todos.delete': () => {
      todos = [];
      return null;
    },
    ...overrides,
  };
  return {
    ...render(
      <TestApiProvider handlers={handlers}>
        <TodoPage />
      </TestApiProvider>,
    ),
    user: userEvent.setup(),
  };
}
it('creates a trimmed title, toggles it both ways and deletes it', async () => {
  const { user } = renderPage();
  await screen.findByRole('list', { name: 'Todos' });
  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Read  ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'Read' });
  expect(checkbox).not.toBeChecked();
  expect(screen.getByRole('textbox')).toHaveValue('');
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  await waitFor(() => expect(checkbox).toBeEnabled());
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
  await user.click(screen.getByRole('button', { name: 'Delete Read' }));
  await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument());
});
it.each(['', '   '])('shows validation for %j without creating', async (title) => {
  const create = jest.fn();
  const { user } = renderPage({ 'todos.create': create });
  await user.type(screen.getByRole('textbox'), title || ' ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(create).not.toHaveBeenCalled();
});
it('reports load failure', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('offline')) });
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load');
});
it('reports failed creates and keeps the title for retry', async () => {
  const { user } = renderPage({ 'todos.create': () => Promise.reject(new Error('offline')) });
  await user.type(screen.getByRole('textbox'), 'Read');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load');
  expect(screen.getByRole('textbox')).toHaveValue('Read');
});
it('has no detectable accessibility violations', async () => {
  const { container } = renderPage();
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(await axe(container)).toHaveNoViolations();
});
