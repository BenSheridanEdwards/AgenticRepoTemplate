import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

/** An in-memory api with the real procedures' behaviour, one handler per path. */
function fakeApi(initial: readonly Todo[] = []) {
  let todos = [...initial];
  const handlers = {
    'todos.list': jest.fn(() => todos),
    'todos.create': jest.fn(({ title }: { title: string }) => {
      const todo = { id: String(todos.length + 1), title, completed: false };
      todos = [...todos, todo];
      return todo;
    }),
    'todos.toggle': jest.fn(({ id }: { id: string }) => {
      todos = todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      );
      return todos.find((todo) => todo.id === id) as Todo;
    }),
    'todos.delete': jest.fn(({ id }: { id: string }) => {
      const deleted = todos.find((todo) => todo.id === id) as Todo;
      todos = todos.filter((todo) => todo.id !== id);
      return deleted;
    }),
  } satisfies TestApiHandlers;
  return handlers;
}

function renderPage(handlers: TestApiHandlers) {
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

async function addTodo(user: ReturnType<typeof userEvent.setup>, title: string) {
  const field = screen.getByRole('textbox', { name: 'Title' });
  await user.clear(field);
  if (title) {
    await user.type(field, title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));
}

it('shows the Todos heading and an empty list note', async () => {
  renderPage(fakeApi());

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  expect(await screen.findByText('No todos yet')).toBeInTheDocument();
});

it('creates a todo with the trimmed title and lists it unchecked', async () => {
  const api = fakeApi();
  const { user } = renderPage(api);
  await screen.findByText('No todos yet');

  await addTodo(user, '  Buy milk ');

  const list = await screen.findByRole('list', { name: 'Todos' });
  expect(await within(list).findByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
  expect(api['todos.create']).toHaveBeenCalledWith({ title: 'Buy milk' });
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});

it.each(['', '   '])('asks for a title and sends nothing when it is %j', async (title) => {
  const api = fakeApi();
  const { user } = renderPage(api);

  await addTodo(user, title);

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInvalid();
  expect(api['todos.create']).not.toHaveBeenCalled();
});

it('toggles a todo complete and back', async () => {
  const api = fakeApi([{ id: '1', title: 'Walk the dog', completed: false }]);
  const { user } = renderPage(api);
  const checkbox = await screen.findByRole('checkbox', { name: 'Walk the dog' });

  await user.click(checkbox);
  expect(
    await screen.findByRole('checkbox', { name: 'Walk the dog', checked: true }),
  ).toBeChecked();

  await user.click(checkbox);
  expect(
    await screen.findByRole('checkbox', { name: 'Walk the dog', checked: false }),
  ).not.toBeChecked();
  expect(api['todos.toggle']).toHaveBeenCalledWith({ id: '1' });
});

it('deletes a todo', async () => {
  const api = fakeApi([
    { id: '1', title: 'Water the plants', completed: false },
    { id: '2', title: 'Read a book', completed: true },
  ]);
  const { user } = renderPage(api);

  await user.click(await screen.findByRole('button', { name: 'Delete Water the plants' }));

  await screen.findByText('Read a book');
  expect(await screen.findAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('checkbox', { name: 'Read a book' })).toBeChecked();
  expect(api['todos.delete']).toHaveBeenCalledWith({ id: '1' });
});

it('says so when the list cannot load', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('api down')) });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the todos');
});

it('says so when a change cannot be saved', async () => {
  const { user } = renderPage({
    ...fakeApi(),
    'todos.create': () => Promise.reject(new Error('api down')),
  });
  await screen.findByText('No todos yet');

  await addTodo(user, 'Buy milk');

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the change');
});

it('has no axe-detectable violations with a todo listed', async () => {
  const { container } = renderPage(fakeApi([{ id: '1', title: 'Buy milk', completed: false }]));

  await screen.findByRole('list', { name: 'Todos' });

  expect(await axe(container)).toHaveNoViolations();
});

it('has no axe-detectable violations with a validation error showing', async () => {
  const { container, user } = renderPage(fakeApi());

  await addTodo(user, '');
  await screen.findByRole('alert');

  expect(await axe(container)).toHaveNoViolations();
});
