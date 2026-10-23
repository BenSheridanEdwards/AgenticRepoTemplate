import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodoPage } from './TodoPage';

function renderPage(handlers: TestApiHandlers = {}) {
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodoPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}
it('creates, toggles and deletes through the api and resets the form', async () => {
  let todos = [{ id: 'first', title: 'First', completed: false }];
  const { user } = renderPage({
    'todo.list': () => todos,
    'todo.create': ({ title }) => {
      const todo = { id: 'second', title, completed: false };
      todos = [...todos, todo];
      return todo;
    },
    'todo.toggle': ({ id }) => {
      todos = todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      );
      return todos.find((todo) => todo.id === id);
    },
    'todo.delete': ({ id }) => {
      todos = todos.filter((todo) => todo.id !== id);
      return { deleted: true };
    },
  });
  await screen.findByRole('checkbox', { name: 'First' });
  await user.type(screen.getByRole('textbox', { name: 'Title' }), ' Second ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'Second' });
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  await user.click(screen.getByRole('button', { name: 'Delete Second' }));
  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'Second' })).not.toBeInTheDocument(),
  );
});
it('validates blank input accessibly', async () => {
  const create = jest.fn();
  const { user, container } = renderPage({ 'todo.list': () => [], 'todo.create': create });
  await user.type(screen.getByRole('textbox'), '   ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(create).not.toHaveBeenCalled();
  expect(await axe(container)).toHaveNoViolations();
});
it('reports loading failure', async () => {
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save or load todos');
});
it('retains the title when creating fails', async () => {
  const { user } = renderPage({
    'todo.list': () => [],
    'todo.create': () => Promise.reject(new Error('unavailable')),
  });
  await user.type(screen.getByRole('textbox'), 'Keep me');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.getByRole('textbox')).toHaveValue('Keep me');
});
