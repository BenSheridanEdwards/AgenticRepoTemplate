import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type RouterOutputs, type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

type Todo = RouterOutputs['todos']['list'][number];

function renderPage(overrides: TestApiHandlers = {}) {
  let todos: Todo[] = [];
  const handlers: TestApiHandlers = {
    'todos.list': () => todos,
    'todos.create': ({ title }) => {
      const todo = { id: 'one', title, completed: false };
      todos = [...todos, todo];
      return todo;
    },
    'todos.toggle': ({ id }) => {
      todos = todos.map((todo) => ({ ...todo, completed: !todo.completed }));
      const todo = todos.find((item) => item.id === id);
      if (!todo) {
        throw new Error('missing');
      }
      return todo;
    },
    'todos.delete': ({ id }) => {
      todos = [];
      return { id };
    },
    ...overrides,
  };
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

it('creates a trimmed title, toggles both ways, and deletes through the api', async () => {
  const { user } = renderPage();
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
  expect(screen.getByRole('textbox')).toHaveValue('');
});

it.each(['', '   '])('rejects blank title %j without an api call', async (title) => {
  const create = jest.fn();
  const { user, container } = renderPage({ 'todos.create': create });
  if (title) {
    await user.type(screen.getByRole('textbox'), title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(create).not.toHaveBeenCalled();
  expect(await axe(container)).toHaveNoViolations();
});

it('reports a list failure', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('offline')) });
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load or save todos');
});

it('keeps the title and reports a failed create', async () => {
  const { user } = renderPage({ 'todos.create': () => Promise.reject(new Error('offline')) });
  await user.type(screen.getByRole('textbox'), 'Read');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load or save todos');
  expect(screen.getByRole('textbox')).toHaveValue('Read');
});
