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

/** In-memory handlers that behave like the api, so the page refetches real changes. */
function fakeApi(initial: readonly Todo[] = []) {
  let todos = [...initial];
  let lastId = todos.length;
  const handlers = {
    'todos.list': jest.fn(() => todos),
    'todos.create': jest.fn(({ title }: { title: string }) => {
      lastId += 1;
      const todo = { id: String(lastId), title, completed: false };
      todos = [...todos, todo];
      return todo;
    }),
    'todos.toggle': jest.fn(({ id }: { id: string }) => {
      todos = todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      );
      return todos.find((todo) => todo.id === id) ?? { id, title: '', completed: false };
    }),
    'todos.delete': jest.fn(({ id }: { id: string }) => {
      const removed = todos.find((todo) => todo.id === id) ?? { id, title: '', completed: false };
      todos = todos.filter((todo) => todo.id !== id);
      return removed;
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

async function addTitle(user: ReturnType<typeof userEvent.setup>, title: string) {
  const field = screen.getByRole('textbox', { name: 'Title' });
  await user.clear(field);
  if (title) {
    await user.type(field, title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));
}

it('shows the Todos heading and says when there are no todos', async () => {
  renderPage(fakeApi());

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  expect(await screen.findByText('No todos yet.')).toBeInTheDocument();
});

it('adds a trimmed todo that shows unchecked in the Todos list, and clears the field', async () => {
  const api = fakeApi();
  const { user } = renderPage(api);

  await addTitle(user, '  Buy milk ');

  const list = await screen.findByRole('list', { name: 'Todos' });
  expect(within(list).getByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
  expect(api['todos.create']).toHaveBeenCalledWith({ title: 'Buy milk' });
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});

it.each(['', '   '])('asks for a title and sends nothing when it is %j', async (title) => {
  const api = fakeApi();
  const { user } = renderPage(api);

  await addTitle(user, title);

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInvalid();
  expect(api['todos.create']).not.toHaveBeenCalled();
});

it('toggles a todo complete and back', async () => {
  const { user } = renderPage(fakeApi([{ id: '1', title: 'Walk the dog', completed: false }]));
  const checkbox = await screen.findByRole('checkbox', { name: 'Walk the dog' });

  await user.click(checkbox);
  expect(
    await screen.findByRole('checkbox', { name: 'Walk the dog', checked: true }),
  ).toBeVisible();

  await user.click(checkbox);
  expect(
    await screen.findByRole('checkbox', { name: 'Walk the dog', checked: false }),
  ).toBeVisible();
});

it('deletes a todo', async () => {
  const { user } = renderPage(
    fakeApi([
      { id: '1', title: 'Water the plants', completed: false },
      { id: '2', title: 'Read a book', completed: true },
    ]),
  );

  await user.click(await screen.findByRole('button', { name: 'Delete Water the plants' }));

  expect(await screen.findByText('Read a book')).toBeInTheDocument();
  await screen.findByRole('list', { name: 'Todos' });
  expect(screen.queryByRole('checkbox', { name: 'Water the plants' })).not.toBeInTheDocument();
});

it('says so when the todos cannot load', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('api down')) });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the todos');
});

it('says so when a change cannot be saved', async () => {
  const { user } = renderPage({
    'todos.list': () => [],
    'todos.create': () => Promise.reject(new Error('api down')),
  });

  await addTitle(user, 'Buy milk');

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the change');
});

it('has no axe-detectable violations with a todo listed and a validation error showing', async () => {
  const { container, user } = renderPage(
    fakeApi([{ id: '1', title: 'Read a book', completed: false }]),
  );

  await screen.findByRole('list', { name: 'Todos' });
  await addTitle(user, '');
  await screen.findByRole('alert');

  expect(await axe(container)).toHaveNoViolations();
});
