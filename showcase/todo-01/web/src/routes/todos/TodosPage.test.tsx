import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';
import type { Todo } from './useTodos';

/** Handlers over one in-memory list, so each change shows in the next list call. */
function inMemoryHandlers(initial: readonly Todo[]) {
  let todos = [...initial];
  const find = (id: string) => {
    const todo = todos.find((candidate) => candidate.id === id);
    if (!todo) {
      throw new Error(`no todo ${id}`);
    }
    return todo;
  };
  return {
    'todos.list': () => todos,
    'todos.add': jest.fn(({ title }: { title: string }) => {
      const todo = { id: String(todos.length + 1), title, completed: false };
      todos = [...todos, todo];
      return todo;
    }),
    'todos.toggle': ({ id }: { id: string }) => {
      const toggled = { ...find(id), completed: !find(id).completed };
      todos = todos.map((todo) => (todo.id === id ? toggled : todo));
      return toggled;
    },
    'todos.delete': ({ id }: { id: string }) => {
      const deleted = find(id);
      todos = todos.filter((todo) => todo.id !== id);
      return deleted;
    },
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

async function addTitle(user: ReturnType<typeof userEvent.setup>, title: string) {
  const field = screen.getByRole('textbox', { name: 'Title' });
  await user.clear(field);
  if (title) {
    await user.type(field, title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));
}

const todoList = () => screen.getByRole('list', { name: 'Todos' });

it('lists the todos from the api', async () => {
  renderPage(inMemoryHandlers([{ id: '1', title: 'Buy milk', completed: true }]));

  expect(await screen.findByRole('checkbox', { name: 'Buy milk' })).toBeChecked();
  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
});

it('says there is nothing to do when the list is empty', async () => {
  renderPage(inMemoryHandlers([]));

  expect(await screen.findByText('Nothing to do yet.')).toBeInTheDocument();
  expect(within(todoList()).queryAllByRole('listitem')).toHaveLength(0);
});

it('adds a todo with the trimmed title and clears the field', async () => {
  const handlers = inMemoryHandlers([]);
  const { user } = renderPage(handlers);

  await addTitle(user, '  Buy milk ');

  expect(await within(todoList()).findByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
  expect(handlers['todos.add']).toHaveBeenCalledWith({ title: 'Buy milk' });
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});

it.each(['', '   '])('asks for a title and adds nothing when it is %j', async (title) => {
  const handlers = inMemoryHandlers([]);
  const { user } = renderPage(handlers);

  await addTitle(user, title);

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInvalid();
  expect(handlers['todos.add']).not.toHaveBeenCalled();
});

it('toggles a todo complete and back', async () => {
  const { user } = renderPage(inMemoryHandlers([{ id: '1', title: 'Buy milk', completed: false }]));
  const checkbox = await screen.findByRole('checkbox', { name: 'Buy milk' });

  await user.click(checkbox);
  await screen.findByRole('checkbox', { name: 'Buy milk', checked: true });

  await user.click(checkbox);
  expect(await screen.findByRole('checkbox', { name: 'Buy milk', checked: false })).toBeVisible();
});

it('deletes a todo', async () => {
  const { user } = renderPage(
    inMemoryHandlers([
      { id: '1', title: 'Buy milk', completed: false },
      { id: '2', title: 'Walk the dog', completed: false },
    ]),
  );

  await user.click(await screen.findByRole('button', { name: 'Delete Buy milk' }));

  await screen.findByText('Walk the dog');
  expect(screen.queryByRole('checkbox', { name: 'Buy milk' })).not.toBeInTheDocument();
});

it('says so when the todos cannot be loaded', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('api down')) });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the todos');
});

it('says so when a change cannot be saved', async () => {
  const { user } = renderPage({
    'todos.list': () => [],
    'todos.add': () => Promise.reject(new Error('api down')),
  });

  await addTitle(user, 'Buy milk');

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the change');
});

it('has no axe-detectable violations with a todo listed', async () => {
  const { container } = renderPage(
    inMemoryHandlers([{ id: '1', title: 'Buy milk', completed: true }]),
  );

  await screen.findByRole('checkbox', { name: 'Buy milk' });

  expect(await axe(container)).toHaveNoViolations();
});
