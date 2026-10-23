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

const milk = { id: '1', title: 'Buy milk', completed: false };

it('loads, then holds the todos from the api', async () => {
  const { result } = renderTodos({ 'todos.list': () => [milk] });

  expect(result.current.todos).toEqual({ status: 'loading' });
  await waitFor(() => expect(result.current.todos).toEqual({ status: 'success', todos: [milk] }));
});

it('reports a failed load', async () => {
  const { result } = renderTodos({ 'todos.list': () => Promise.reject(new Error('api down')) });

  await waitFor(() => expect(result.current.todos).toEqual({ status: 'error' }));
});

it('reads the list again after a write', async () => {
  const list = jest.fn(() => [milk]);
  const { result } = renderTodos({
    'todos.list': list,
    'todos.create': ({ title }) => ({ id: '2', title, completed: false }),
  });
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

  act(() => result.current.addTodo('Walk the dog'));

  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(result.current.saveFailed).toBe(false);
});

it('reports a failed delete', async () => {
  const { result } = renderTodos({
    'todos.list': () => [milk],
    'todos.delete': () => Promise.reject(new Error('api down')),
  });

  act(() => result.current.deleteTodo('1'));

  await waitFor(() => expect(result.current.saveFailed).toBe(true));
});
