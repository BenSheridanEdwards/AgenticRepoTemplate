import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { useTodos } from './useTodos';

function renderTodos(handlers: TestApiHandlers) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider handlers={handlers}>{children}</TestApiProvider>
  );
  return renderHook(() => useTodos(), { wrapper });
}

it('loads, then holds the todos from the api', async () => {
  let answer: (todos: { id: string; title: string; completed: boolean }[]) => void = () =>
    undefined;
  const list = jest.fn(
    () =>
      new Promise<{ id: string; title: string; completed: boolean }[]>((resolve) => {
        answer = resolve;
      }),
  );
  const { result } = renderTodos({ 'todos.list': list });

  await waitFor(() => expect(list).toHaveBeenCalled());
  expect(result.current.todos).toEqual({ status: 'loading' });

  act(() => answer([{ id: '1', title: 'Buy milk', completed: false }]));
  await waitFor(() =>
    expect(result.current.todos).toEqual({
      status: 'success',
      todos: [{ id: '1', title: 'Buy milk', completed: false }],
    }),
  );
});

it('refreshes the todos after a change is saved', async () => {
  const list = jest
    .fn()
    .mockReturnValueOnce([])
    .mockReturnValue([{ id: '1', title: 'Buy milk', completed: false }]);
  const { result } = renderTodos({
    'todos.list': list,
    'todos.create': ({ title }) => ({ id: '1', title, completed: false }),
  });
  await waitFor(() => expect(result.current.todos).toEqual({ status: 'success', todos: [] }));

  act(() => result.current.addTodo('Buy milk'));

  await waitFor(() =>
    expect(result.current.todos).toEqual({
      status: 'success',
      todos: [{ id: '1', title: 'Buy milk', completed: false }],
    }),
  );
  expect(result.current.saveFailed).toBe(false);
});

it('reports a change that could not be saved', async () => {
  const { result } = renderTodos({
    'todos.list': () => [],
    'todos.delete': () => Promise.reject(new Error('api down')),
  });

  act(() => result.current.deleteTodo('1'));

  await waitFor(() => expect(result.current.saveFailed).toBe(true));
});
