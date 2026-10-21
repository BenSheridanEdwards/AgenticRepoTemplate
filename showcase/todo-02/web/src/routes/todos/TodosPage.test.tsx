import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

interface StoredTodo {
  id: string;
  title: string;
  completed: boolean;
}

/** A stateful in-memory api, so create, toggle and delete reflect in the list. */
function makeHandlers(initial: readonly StoredTodo[] = []): TestApiHandlers {
  const todos: StoredTodo[] = initial.map((todo) => ({ ...todo }));
  let nextId = todos.length + 1;
  return {
    'todo.list': () => todos.map((todo) => ({ ...todo })),
    'todo.create': ({ title }) => {
      const todo = { id: `id-${nextId++}`, title, completed: false };
      todos.push(todo);
      return { ...todo };
    },
    'todo.toggle': ({ id }) => {
      const todo = todos.find((item) => item.id === id);
      if (todo) {
        todo.completed = !todo.completed;
      }
      return todos.map((item) => ({ ...item }));
    },
    'todo.remove': ({ id }) => {
      const index = todos.findIndex((item) => item.id === id);
      if (index >= 0) {
        todos.splice(index, 1);
      }
      return todos.map((item) => ({ ...item }));
    },
  };
}

function renderPage(handlers: TestApiHandlers) {
  const view = render(
    <TestApiProvider handlers={handlers}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

it('shows the Todos heading, the Title field and the Add button', () => {
  renderPage(makeHandlers());

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
});

it('adds a todo that appears unchecked in the list', async () => {
  const { user } = renderPage(makeHandlers());

  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Buy milk');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
});

it.each(['', '   '])('adds nothing and shows an alert for the blank title %j', async (title) => {
  const create = jest.fn(({ title: value }: { title: string }) => ({
    id: 'x',
    title: value,
    completed: false,
  }));
  const { user } = renderPage({ ...makeHandlers(), 'todo.create': create });

  const field = screen.getByRole('textbox', { name: 'Title' });
  await user.clear(field);
  if (title) {
    await user.type(field, title);
  }
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(create).not.toHaveBeenCalled();
});

it('toggles a todo complete and reflects the new state', async () => {
  const { user } = renderPage(
    makeHandlers([{ id: 'id-1', title: 'Walk the dog', completed: false }]),
  );

  const checkbox = await screen.findByRole('checkbox', { name: 'Walk the dog' });
  expect(checkbox).not.toBeChecked();

  await user.click(checkbox);

  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Walk the dog' })).toBeChecked());
});

it('deletes a todo', async () => {
  const { user } = renderPage(
    makeHandlers([{ id: 'id-1', title: 'Water the plants', completed: false }]),
  );

  await screen.findByRole('checkbox', { name: 'Water the plants' });
  await user.click(screen.getByRole('button', { name: 'Delete Water the plants' }));

  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'Water the plants' })).not.toBeInTheDocument(),
  );
});

it('has no axe-detectable violations with a todo listed', async () => {
  const { container } = renderPage(
    makeHandlers([{ id: 'id-1', title: 'Read a book', completed: false }]),
  );
  await screen.findByRole('checkbox', { name: 'Read a book' });

  expect(await axe(container)).toHaveNoViolations();
});
