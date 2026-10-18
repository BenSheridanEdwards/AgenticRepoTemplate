import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';
import type { Todo } from './useTodos';

/** A handler set over one in-memory list, like the api's own storage. */
function memoryApi(initial: readonly Todo[] = []) {
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
      const toggled = todos.find((todo) => todo.id === id);
      if (!toggled) {
        throw new Error('missing');
      }
      return toggled;
    }),
    'todos.delete': jest.fn(({ id }: { id: string }) => {
      todos = todos.filter((todo) => todo.id !== id);
      return { id };
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

it('shows the heading and the todos the api holds', async () => {
  renderPage(memoryApi([{ id: '1', title: 'Buy milk', completed: true }]));

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  const list = await screen.findByRole('list', { name: 'Todos' });
  expect(within(list).getByRole('checkbox', { name: 'Buy milk' })).toBeChecked();
});

it('says when there is nothing to do yet', async () => {
  renderPage(memoryApi());

  expect(await screen.findByText('Nothing to do yet.')).toBeInTheDocument();
});

it('adds a trimmed title as a todo that is not complete, and clears the field', async () => {
  const api = memoryApi();
  const { user } = renderPage(api);
  await screen.findByRole('list', { name: 'Todos' });

  await addTodo(user, '  Buy milk ');

  expect(await screen.findByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
  expect(api['todos.create']).toHaveBeenCalledWith({ title: 'Buy milk' });
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});

it.each(['', '   '])('asks for a title and adds nothing when it is %j', async (title) => {
  const api = memoryApi();
  const { user } = renderPage(api);

  await addTodo(user, title);

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInvalid();
  expect(api['todos.create']).not.toHaveBeenCalled();
});

it('toggles a todo complete and back', async () => {
  const { user } = renderPage(memoryApi([{ id: '1', title: 'Buy milk', completed: false }]));
  const checkbox = await screen.findByRole('checkbox', { name: 'Buy milk' });

  await user.click(checkbox);
  expect(await screen.findByRole('checkbox', { name: 'Buy milk', checked: true })).toBeVisible();

  await user.click(checkbox);
  expect(await screen.findByRole('checkbox', { name: 'Buy milk', checked: false })).toBeVisible();
});

it('deletes a todo', async () => {
  const { user } = renderPage(
    memoryApi([
      { id: '1', title: 'Buy milk', completed: false },
      { id: '2', title: 'Walk the dog', completed: false },
    ]),
  );

  await user.click(await screen.findByRole('button', { name: 'Delete Buy milk' }));

  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'Buy milk' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('checkbox', { name: 'Walk the dog' })).toBeInTheDocument();
});

it('says so when the todos cannot load', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('api down')) });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the todos');
});

it('says so when a change cannot be saved', async () => {
  const { user } = renderPage({
    ...memoryApi(),
    'todos.create': () => Promise.reject(new Error('api down')),
  });
  await screen.findByRole('list', { name: 'Todos' });

  await addTodo(user, 'Buy milk');

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the todo');
});

it('has no axe-detectable violations with a todo listed and a validation error showing', async () => {
  const { container, user } = renderPage(
    memoryApi([{ id: '1', title: 'Buy milk', completed: false }]),
  );
  await screen.findByRole('list', { name: 'Todos' });

  await addTodo(user, '');
  await screen.findByRole('alert');

  expect(await axe(container)).toHaveNoViolations();
});
