import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

/** An in-memory api over `todos`, like the real one, for each test. */
function fakeApi(todos: Todo[] = []): TestApiHandlers {
  return {
    'todos.list': () => [...todos],
    'todos.add': ({ title }) => {
      const todo = { id: String(todos.length + 1), title, completed: false };
      todos.push(todo);
      return todo;
    },
    'todos.toggle': ({ id }) => {
      const todo = todos.find((candidate) => candidate.id === id);
      if (!todo) {
        throw new Error('missing');
      }
      todo.completed = !todo.completed;
      return { ...todo };
    },
    'todos.delete': ({ id }) => {
      const [todo] = todos.splice(
        todos.findIndex((candidate) => candidate.id === id),
        1,
      );
      if (!todo) {
        throw new Error('missing');
      }
      return todo;
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

async function submitTitle(user: ReturnType<typeof userEvent.setup>, title: string) {
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
  expect(await screen.findByText('No todos yet')).toBeInTheDocument();
});

it('adds a trimmed todo, lists it unchecked and clears the field', async () => {
  const handlers = fakeApi();
  const add = jest.fn(handlers['todos.add']);
  const { user } = renderPage({ ...handlers, 'todos.add': add });

  await submitTitle(user, '  Buy milk ');

  expect(await screen.findByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked();
  expect(screen.getByRole('list', { name: 'Todos' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  expect(add).toHaveBeenCalledWith({ title: 'Buy milk' });
});

it.each(['', '   '])('asks for a title and sends nothing when it is %j', async (title) => {
  const add = jest.fn(() => ({ id: '1', title: 'unused', completed: false }));
  const { user } = renderPage({ ...fakeApi(), 'todos.add': add });

  await submitTitle(user, title);

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title');
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeInvalid();
  expect(add).not.toHaveBeenCalled();
});

it('toggles a todo complete and back', async () => {
  const { user } = renderPage(fakeApi([{ id: '1', title: 'Walk the dog', completed: false }]));
  const checkbox = await screen.findByRole('checkbox', { name: 'Walk the dog' });

  await user.click(checkbox);
  expect(
    await screen.findByRole('checkbox', { name: 'Walk the dog', checked: true }),
  ).toBeChecked();

  await user.click(checkbox);
  expect(
    await screen.findByRole('checkbox', { name: 'Walk the dog', checked: false }),
  ).not.toBeChecked();
});

it('deletes a todo', async () => {
  const { user } = renderPage(
    fakeApi([
      { id: '1', title: 'Keep me', completed: false },
      { id: '2', title: 'Water the plants', completed: false },
    ]),
  );

  await user.click(await screen.findByRole('button', { name: 'Delete Water the plants' }));

  await screen.findByRole('checkbox', { name: 'Keep me' });
  expect(await screen.findAllByRole('checkbox')).toHaveLength(1);
});

it('says so when the todos cannot be loaded', async () => {
  renderPage({ 'todos.list': () => Promise.reject(new Error('api down')) });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the todos');
});

it('says so when a change cannot be saved', async () => {
  const { user } = renderPage({
    ...fakeApi(),
    'todos.add': () => Promise.reject(new Error('api down')),
  });

  await submitTitle(user, 'Buy milk');

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the change');
});

it('has no axe-detectable violations with a todo listed', async () => {
  const { container } = renderPage(fakeApi([{ id: '1', title: 'Read a book', completed: true }]));

  await screen.findByRole('checkbox', { name: 'Read a book' });

  expect(await axe(container)).toHaveNoViolations();
});
