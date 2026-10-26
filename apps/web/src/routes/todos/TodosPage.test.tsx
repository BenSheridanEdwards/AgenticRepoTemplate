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
      const todo = { id: String(todos.length + 1), title, completed: false };
      todos = [...todos, todo];
      return todo;
    },
    'todos.toggle': ({ id }) => {
      todos = todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      );
      const updated = todos.find((todo) => todo.id === id);
      if (!updated) throw new Error('Todo not found');
      return updated;
    },
    'todos.delete': ({ id }) => {
      todos = todos.filter((todo) => todo.id !== id);
      return true;
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

it('creates a trimmed title, refreshes the list, toggles both ways and deletes', async () => {
  const { user } = renderPage();
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

it.each(['', '   '])('rejects blank title %j without sending it to the api', async (title) => {
  const create = jest.fn();
  const { user, container } = renderPage({ 'todos.create': create });
  if (title) await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(create).not.toHaveBeenCalled();
  expect(await axe(container)).toHaveNoViolations();
});

it('shows a list error', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('offline')) });
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load todos');
});

it('preserves the title and permits retry after creation fails', async () => {
  const create = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ id: 'one', title: 'Read', completed: false });
  const { user } = renderPage({ 'todos.create': create });
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Read');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not add todo');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Read');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(''));
});

it.each([
  'todos.toggle',
  'todos.delete',
] as const)('shows a failed %s and keeps the todo visible', async (path) => {
  const todo = { id: 'one', title: 'Read', completed: false };
  const { user, container } = renderPage({
    'todos.list': () => [todo],
    [path]: () => Promise.reject(new Error('offline')),
  });
  await screen.findByRole('checkbox', { name: 'Read' });
  await user.click(
    path === 'todos.toggle'
      ? screen.getByRole('checkbox')
      : screen.getByRole('button', { name: 'Delete Read' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not update todo');
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(await axe(container)).toHaveNoViolations();
});
