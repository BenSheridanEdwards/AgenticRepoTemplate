import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

interface StoredTodo {
  id: string;
  title: string;
  completed: boolean;
}

function renderPage() {
  const todos: StoredTodo[] = [];
  let sequence = 0;
  const handlers: TestApiHandlers = {
    'todo.list': () => todos.map((todo) => ({ ...todo })),
    'todo.create': ({ title }) => {
      sequence += 1;
      const todo = { id: `id-${sequence}`, title, completed: false };
      todos.push(todo);
      return { ...todo };
    },
    'todo.toggle': ({ id }) => {
      const todo = todos.find((candidate) => candidate.id === id);
      if (!todo) {
        throw new Error(`No todo with id ${id}`);
      }
      todo.completed = !todo.completed;
      return { ...todo };
    },
    'todo.delete': ({ id }) => {
      const index = todos.findIndex((candidate) => candidate.id === id);
      if (index >= 0) {
        todos.splice(index, 1);
      }
      return { id };
    },
  };
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

async function addTodo(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('checkbox', { name: title })).toBeInTheDocument();
}

it('shows the Todos heading and adds a todo that appears unchecked', async () => {
  const { user } = renderPage();

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  await addTodo(user, 'Buy milk');

  const list = screen.getByRole('list', { name: 'Todos' });
  expect(within(list).getByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
});

it('toggles a todo complete and back', async () => {
  const { user } = renderPage();
  await addTodo(user, 'Walk the dog');
  const checkbox = screen.getByRole('checkbox', { name: 'Walk the dog' });

  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());

  await user.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
});

it('deletes a todo', async () => {
  const { user } = renderPage();
  await addTodo(user, 'Water the plants');

  await user.click(screen.getByRole('button', { name: 'Delete Water the plants' }));

  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'Water the plants' })).not.toBeInTheDocument(),
  );
});

it('shows an alert and adds nothing when the title is blank', async () => {
  const { user } = renderPage();

  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInvalid();
  expect(
    within(screen.getByRole('list', { name: 'Todos' })).queryAllByRole('checkbox'),
  ).toHaveLength(0);
});

it('has no axe-detectable violations with a todo listed', async () => {
  const { container, user } = renderPage();
  await addTodo(user, 'Read a book');

  expect(await axe(container)).toHaveNoViolations();
});
