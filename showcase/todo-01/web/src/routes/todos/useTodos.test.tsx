import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { type Todo, useTodos } from './useTodos';

function renderTodos() {
  const store: Todo[] = [];
  let counter = 0;
  const handlers: TestApiHandlers = {
    'todo.list': () => store.map((todo) => ({ ...todo })),
    'todo.create': ({ title }) => {
      counter += 1;
      const todo: Todo = { id: String(counter), title, completed: false };
      store.push(todo);
      return { ...todo };
    },
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
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider handlers={handlers}>{children}</TestApiProvider>
  );
  return renderHook(() => useTodos(), { wrapper });
}

it('lists, adds, toggles and deletes todos through the api', async () => {
  const { result } = renderTodos();
  await waitFor(() => expect(result.current.todos).toEqual([]));

  act(() => result.current.addTodo('Buy milk'));
  await waitFor(() =>
    expect(result.current.todos).toEqual([{ id: '1', title: 'Buy milk', completed: false }]),
  );

  act(() => result.current.toggleTodo('1'));
  await waitFor(() => expect(result.current.todos[0]?.completed).toBe(true));

  act(() => result.current.deleteTodo('1'));
  await waitFor(() => expect(result.current.todos).toEqual([]));
});
