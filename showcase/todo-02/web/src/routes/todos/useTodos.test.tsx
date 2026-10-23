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
  const todo = { id: '1', title: 'Buy milk', completed: false };
  const { result } = renderTodos({ 'todos.list': () => [todo] });

  expect(result.current.todos).toEqual({ status: 'loading' });
  await waitFor(() => expect(result.current.todos).toEqual({ status: 'success', todos: [todo] }));
});

it('refreshes the list after a write', async () => {
  const list = jest.fn(() => []);
  const toggle = jest.fn(({ id }: { id: string }) => ({ id, title: 'Buy milk', completed: true }));
  const { result } = renderTodos({ 'todos.list': list, 'todos.toggle': toggle });
  await waitFor(() => expect(result.current.todos.status).toBe('success'));

  act(() => result.current.toggleTodo('1'));

  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(toggle).toHaveBeenCalledWith({ id: '1' });
  expect(result.current.saveFailed).toBe(false);
});

it('reports a write that fails', async () => {
  const { result } = renderTodos({
    'todos.list': () => [],
    'todos.delete': () => Promise.reject(new Error('api down')),
  });

  act(() => result.current.deleteTodo('1'));

  await waitFor(() => expect(result.current.saveFailed).toBe(true));
});
