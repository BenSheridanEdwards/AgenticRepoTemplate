import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

function renderPage(handlers: TestApiHandlers) {
  return render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
}

it('validates, creates, toggles and deletes through the api', async () => {
  const user = userEvent.setup();
  let todos: { id: string; title: string; completed: boolean }[] = [];
  const view = renderPage({
    'todos.list': () => todos,
    'todos.create': ({ title }) => {
      const todo = { id: 'one', title, completed: false };
      todos = [...todos, todo];
      return todo;
    },
    'todos.toggle': ({ id }) => {
      todos = todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      );
      const changed = todos[0];
      if (!changed) throw new Error('Missing todo');
      return changed;
    },
    'todos.delete': () => {
      todos = [];
      return true;
    },
  });
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Read  ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('checkbox', { name: 'Read' })).not.toBeChecked();
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  await user.click(screen.getByRole('checkbox', { name: 'Read' }));
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
  expect(await axe(view.container)).toHaveNoViolations();
  await user.click(screen.getByRole('button', { name: 'Delete Read' }));
  await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument());
});

it('shows loading and query failure', async () => {
  renderPage({
    'todos.list': () => {
      throw new Error('offline');
    },
  });
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load');
});

it('keeps the title when creation fails', async () => {
  const user = userEvent.setup();
  renderPage({
    'todos.list': () => [],
    'todos.create': () => {
      throw new Error('offline');
    },
  });
  await user.type(screen.getByRole('textbox'), 'Read');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load');
  expect(screen.getByRole('textbox')).toHaveValue('Read');
});

it('reports toggle and delete failures', async () => {
  const user = userEvent.setup();
  renderPage({
    'todos.list': () => [{ id: 'one', title: 'Read', completed: false }],
    'todos.toggle': () => {
      throw new Error('offline');
    },
    'todos.delete': () => {
      throw new Error('offline');
    },
  });
  await user.click(await screen.findByRole('checkbox'));
  expect(await screen.findByRole('alert')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Delete Read' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Read' })).toBeEnabled());
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});
