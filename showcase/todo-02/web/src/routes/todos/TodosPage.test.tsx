import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';
import type { Todo } from './useTodos';

/** Handlers over one in-memory list, so each write shows up in the next list read. */
function inMemoryHandlers(initial: readonly Todo[]) {
  let todos = [...initial];
  return {
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

const milk = { id: '1', title: 'Buy milk', completed: false };

it('lists the todos from the api', async () => {
  renderPage(inMemoryHandlers([milk]));

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  const list = await screen.findByRole('list', { name: 'Todos' });
  expect(within(list).getByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
});

it('says so when there are no todos yet', async () => {
  renderPage(inMemoryHandlers([]));

  expect(await screen.findByText('No todos yet')).toBeInTheDocument();
});

it('adds a todo with the trimmed title and clears the field', async () => {
  const handlers = inMemoryHandlers([]);
  const { user } = renderPage(handlers);

  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Walk the dog ');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('checkbox', { name: 'Walk the dog' })).toBeInTheDocument();
  expect(handlers['todos.create']).toHaveBeenCalledWith({ title: 'Walk the dog' });
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});

it.each(['', '   '])('asks for a title and sends nothing when the title is %j', async (title) => {
  const handlers = inMemoryHandlers([]);
  const { user } = renderPage(handlers);

  const field = screen.getByRole('textbox', { name: 'Title' });
  if (title) {
    await user.type(field, title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(field).toBeInvalid();
  expect(handlers['todos.create']).not.toHaveBeenCalled();
});

it('toggles a todo complete and back', async () => {
  const { user } = renderPage(inMemoryHandlers([milk]));

  const checkbox = await screen.findByRole('checkbox', { name: 'Buy milk' });
  await user.click(checkbox);
  expect(
    await screen.findByRole('checkbox', { name: 'Buy milk', checked: true }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('checkbox', { name: 'Buy milk' }));
  expect(
    await screen.findByRole('checkbox', { name: 'Buy milk', checked: false }),
  ).toBeInTheDocument();
});

it('deletes a todo', async () => {
  const handlers = inMemoryHandlers([milk]);
  const { user } = renderPage(handlers);

  await user.click(await screen.findByRole('button', { name: 'Delete Buy milk' }));

  expect(await screen.findByText('No todos yet')).toBeInTheDocument();
  expect(handlers['todos.delete']).toHaveBeenCalledWith({ id: '1' });
});

it('says so when the list fails to load', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('api down')) });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the todos');
});

it('says so when a change fails to save', async () => {
  const { user } = renderPage({
    ...inMemoryHandlers([milk]),
    'todos.toggle': () => Promise.reject(new Error('api down')),
  });

  await user.click(await screen.findByRole('checkbox', { name: 'Buy milk' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the change');
});

it('has no axe-detectable violations with a todo listed and a validation error showing', async () => {
  const { container, user } = renderPage(inMemoryHandlers([milk]));

  await screen.findByRole('list', { name: 'Todos' });
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByRole('alert');

  expect(await axe(container)).toHaveNoViolations();
});
