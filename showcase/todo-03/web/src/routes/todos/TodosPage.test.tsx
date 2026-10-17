import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';
import type { Todo } from './useTodos';

/** An in-memory api over `initial`, with each handler a mock the test can inspect. */
function fakeApi(initial: readonly Todo[] = []) {
  let todos = [...initial];
  let nextId = initial.length + 1;
  return {
    'todos.list': jest.fn(() => todos),
    'todos.create': jest.fn(({ title }: { title: string }) => {
      const todo = { id: String(nextId++), title, completed: false };
      todos = [...todos, todo];
      return todo;
    }),
    'todos.toggle': jest.fn(({ id }: { id: string }) => {
      todos = todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      );
      const toggled = todos.find((todo) => todo.id === id);
      if (!toggled) {
        throw new Error('not found');
      }
      return toggled;
    }),
    'todos.delete': jest.fn(({ id }: { id: string }) => {
      todos = todos.filter((todo) => todo.id !== id);
      return { id };
    }),
  } satisfies TestApiHandlers;
}

function renderPage(handlers: TestApiHandlers) {
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

async function submitTitle(user: ReturnType<typeof userEvent.setup>, title: string) {
  const field = screen.getByRole('textbox', { name: 'Title' });
  await user.clear(field);
  if (title) {
    await user.type(field, title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));
}

const todoList = () => screen.findByRole('list', { name: 'Todos' });

it('shows the heading and the todos from the api', async () => {
  renderPage(fakeApi([{ id: '1', title: 'Buy milk', completed: true }]));

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  const list = await todoList();
  expect(within(list).getByRole('checkbox', { name: 'Buy milk' })).toBeChecked();
});

it('says there are no todos yet when the list is empty', async () => {
  renderPage(fakeApi());

  await todoList();
  expect(screen.getByText('No todos yet.')).toBeInTheDocument();
});

it('adds a todo with the trimmed title and clears the field', async () => {
  const api = fakeApi();
  const { user } = renderPage(api);
  await todoList();

  await submitTitle(user, '  Buy milk ');

  expect(await screen.findByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
  expect(api['todos.create']).toHaveBeenCalledWith({ title: 'Buy milk' });
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});

it.each(['', '   '])('asks for a title and adds nothing when the title is %j', async (title) => {
  const api = fakeApi();
  const { user } = renderPage(api);
  await todoList();

  await submitTitle(user, title);

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInvalid();
  expect(api['todos.create']).not.toHaveBeenCalled();
});

it('toggles a todo complete and back', async () => {
  const api = fakeApi([{ id: '1', title: 'Walk the dog', completed: false }]);
  const { user } = renderPage(api);
  const checkbox = within(await todoList()).getByRole('checkbox', { name: 'Walk the dog' });

  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());

  expect(api['todos.toggle']).toHaveBeenCalledWith({ id: '1' });
});

it('deletes a todo', async () => {
  const api = fakeApi([
    { id: '1', title: 'Water the plants', completed: false },
    { id: '2', title: 'Read a book', completed: false },
  ]);
  const { user } = renderPage(api);
  await todoList();

  await user.click(screen.getByRole('button', { name: 'Delete Water the plants' }));

  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'Water the plants' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('checkbox', { name: 'Read a book' })).toBeInTheDocument();
  expect(api['todos.delete']).toHaveBeenCalledWith({ id: '1' });
});

it('says so when the todos cannot be loaded', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('api down')) });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the todos');
});

it('says so when a change cannot be saved', async () => {
  const { user } = renderPage({
    ...fakeApi(),
    'todos.create': () => Promise.reject(new Error('api down')),
  });
  await todoList();

  await submitTitle(user, 'Buy milk');

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the change');
});

it('has no axe-detectable violations with a todo listed and a validation error showing', async () => {
  const { container, user } = renderPage(
    fakeApi([{ id: '1', title: 'Buy milk', completed: false }]),
  );
  await todoList();

  await submitTitle(user, '');
  await screen.findByRole('alert');

  expect(await axe(container)).toHaveNoViolations();
});
