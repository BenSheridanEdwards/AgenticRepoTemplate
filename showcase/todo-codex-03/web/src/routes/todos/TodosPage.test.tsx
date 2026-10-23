import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

function renderPage(handlers: TestApiHandlers) {
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}
it('creates, toggles and deletes through the api', async () => {
  let todos = [{ id: '1', title: 'Existing', completed: false }];
  const { user, container } = renderPage({
    'todos.list': () => todos,
    'todos.create': ({ title }) => {
      const todo = { id: '2', title, completed: false };
      todos = [...todos, todo];
      return todo;
    },
    'todos.toggle': ({ id }) => {
      todos = todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      );
      return todos.find((todo) => todo.id === id) ?? null;
    },
    'todos.delete': ({ id }) => {
      todos = todos.filter((todo) => todo.id !== id);
      return null;
    },
  });
  await screen.findByRole('checkbox', { name: 'Existing' });
  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  New task  ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'New task' });
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  await user.click(screen.getByRole('button', { name: 'Delete New task' }));
  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'New task' })).not.toBeInTheDocument(),
  );
  expect(await axe(container)).toHaveNoViolations();
});
it.each(['', '   '])('validates blank title %j', async (title) => {
  const create = jest.fn();
  const { user } = renderPage({ 'todos.list': () => [], 'todos.create': create });
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  if (title) {
    await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(create).not.toHaveBeenCalled();
});
it('shows load and mutation errors', async () => {
  const { user } = renderPage({
    'todos.list': () => Promise.reject(new Error('offline')),
    'todos.create': () => Promise.reject(new Error('offline')),
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load');
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Task');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled());
  expect(screen.getByRole('alert')).toBeVisible();
});
