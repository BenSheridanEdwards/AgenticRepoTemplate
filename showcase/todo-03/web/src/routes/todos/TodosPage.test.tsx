import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';
import type { Todo } from './useTodos';

/** Handlers over one in-memory list, so each change shows on the next list call. */
function fakeApi(initial: readonly Todo[]) {
  let todos = [...initial];
  const handlers = {
    'todos.list': () => todos,
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

const milk = { id: '1', title: 'Buy milk', completed: false };

it('lists the todos from the api', async () => {
  renderPage(fakeApi([milk, { id: '2', title: 'Walk the dog', completed: true }]));

  const list = await screen.findByRole('list', { name: 'Todos' });
  expect(within(list).getByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
  expect(within(list).getByRole('checkbox', { name: 'Walk the dog' })).toBeChecked();
});

it('says so when there is nothing to do', async () => {
  renderPage(fakeApi([]));

  expect(await screen.findByText('Nothing to do yet.')).toBeInTheDocument();
});

it('adds a todo with the trimmed title and clears the field', async () => {
  const api = fakeApi([]);
  const { user } = renderPage(api);

  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Buy milk ');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
  expect(api['todos.create']).toHaveBeenCalledWith({ title: 'Buy milk' });
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});

it.each(['', '   '])('asks for a title and sends nothing when the title is %j', async (title) => {
  const api = fakeApi([]);
  const { user } = renderPage(api);

  if (title) {
    await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInvalid();
  expect(api['todos.create']).not.toHaveBeenCalled();
});

it('toggles a todo complete', async () => {
  const api = fakeApi([milk]);
  const { user } = renderPage(api);

  await user.click(await screen.findByRole('checkbox', { name: 'Buy milk' }));

  expect(api['todos.toggle']).toHaveBeenCalledWith({ id: '1' });
  expect(await screen.findByRole('checkbox', { name: 'Buy milk', checked: true })).toBeChecked();
});

it('deletes a todo', async () => {
  const api = fakeApi([milk]);
  const { user } = renderPage(api);

  await user.click(await screen.findByRole('button', { name: 'Delete Buy milk' }));

  expect(await screen.findByText('Nothing to do yet.')).toBeInTheDocument();
  expect(api['todos.delete']).toHaveBeenCalledWith({ id: '1' });
});

it('says so when the todos cannot load', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('api down')) });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the todos');
});

it('says so when a change cannot be saved', async () => {
  const { user } = renderPage({
    ...fakeApi([milk]),
    'todos.delete': () => Promise.reject(new Error('api down')),
  });

  await user.click(await screen.findByRole('button', { name: 'Delete Buy milk' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the change');
  expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument();
});

it('has no axe-detectable violations with a todo listed and a validation error showing', async () => {
  const { container, user } = renderPage(fakeApi([milk]));

  await screen.findByRole('list', { name: 'Todos' });
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByRole('alert');

  expect(await axe(container)).toHaveNoViolations();
});
