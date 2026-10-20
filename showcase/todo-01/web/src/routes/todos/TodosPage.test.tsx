import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';
import type { Todo } from './useTodos';

function renderPage() {
  const store: Todo[] = [];
  let counter = 0;
  const create = jest.fn(({ title }: { title: string }) => {
    counter += 1;
    const todo: Todo = { id: String(counter), title, completed: false };
    store.push(todo);
    return { ...todo };
  });
  const handlers: TestApiHandlers = {
    'todo.list': () => store.map((todo) => ({ ...todo })),
    'todo.create': create,
    'todo.toggle': ({ id }) => {
      const todo = store.find((candidate) => candidate.id === id);
      if (!todo) {
        throw new Error(`No todo with id ${id}`);
      }
      const next: Todo = { ...todo, completed: !todo.completed };
      store[store.indexOf(todo)] = next;
      return { ...next };
    },
    'todo.delete': ({ id }) => {
      const index = store.findIndex((candidate) => candidate.id === id);
      if (index >= 0) {
        store.splice(index, 1);
      }
      return { id };
    },
  };
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup(), create };
}

async function addTodo(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByRole('checkbox', { name: title });
}

it('shows the Todos heading, the Title field and the Add button', () => {
  renderPage();

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
});

it('adds a todo, toggles it complete and back, then deletes it', async () => {
  const { user } = renderPage();

  await addTodo(user, 'Buy milk');
  const checkbox = screen.getByRole('checkbox', { name: 'Buy milk' });
  expect(within(screen.getByRole('list', { name: 'Todos' })).getByRole('checkbox')).toBe(checkbox);
  expect(checkbox).not.toBeChecked();

  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());

  await user.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());

  await user.click(screen.getByRole('button', { name: 'Delete Buy milk' }));
  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'Buy milk' })).not.toBeInTheDocument(),
  );
});

it('clears the field after adding a todo', async () => {
  const { user } = renderPage();

  await addTodo(user, 'Walk the dog');

  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});

it.each(['', '   '])('asks for a title and adds nothing when it is %j', async (title) => {
  const { user, create } = renderPage();

  const field = screen.getByRole('textbox', { name: 'Title' });
  if (title) {
    await user.type(field, title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(field).toBeInvalid();
  expect(create).not.toHaveBeenCalled();
});

it('has no axe-detectable violations with a todo listed', async () => {
  const { container, user } = renderPage();

  await addTodo(user, 'Read a book');

  expect(await axe(container)).toHaveNoViolations();
});
