import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { useGreeting } from './useGreeting';

function renderGreeting(
  greet: (input: { name: string }) => Promise<{ message: string }>,
  record: TestApiHandlers['recentGreetings.record'] = () => ({ names: [] }),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider handlers={{ 'greeting.greet': greet, 'recentGreetings.record': record }}>
      {children}
    </TestApiProvider>
  );
  return renderHook(() => useGreeting(), { wrapper });
}

it('stays idle and asks nothing until a name is requested', () => {
  const greet = jest.fn(async () => ({ message: 'unused' }));
  const { result } = renderGreeting(greet);

  expect(result.current.greeting).toEqual({ status: 'idle' });
  expect(greet).not.toHaveBeenCalled();
});

it('records the trimmed name only after the greeting answers', async () => {
  let answer: (value: { message: string }) => void = () => undefined;
  const record = jest.fn(() => ({ names: ['Ada'] }));
  const { result } = renderGreeting(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
    record,
  );
  act(() => result.current.requestGreeting('  Ada  '));
  await waitFor(() => expect(result.current.greeting).toEqual({ status: 'loading' }));
  expect(record).not.toHaveBeenCalled();
  await act(async () => answer({ message: 'Hello, Ada!' }));
  await waitFor(() => expect(record).toHaveBeenCalledWith({ name: 'Ada' }));
});

it('keeps the greeting visible when recording fails', async () => {
  const record = jest.fn(() => Promise.reject(new Error('record down')));
  const { result } = renderGreeting(async () => ({ message: 'Hello, Ada!' }), record);
  act(() => result.current.requestGreeting('Ada'));
  await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(result.current.greeting).toEqual({ status: 'success', message: 'Hello, Ada!' }),
  );
});

it('loads, then holds the greeting for the requested name', async () => {
  let answer: (value: { message: string }) => void = () => undefined;
  const greet = jest.fn(
    () =>
      new Promise<{ message: string }>((resolve) => {
        answer = resolve;
      }),
  );
  const { result } = renderGreeting(greet);

  act(() => result.current.requestGreeting('Ada'));
  await waitFor(() => expect(greet).toHaveBeenCalledWith({ name: 'Ada' }));
  expect(result.current.greeting).toEqual({ status: 'loading' });

  act(() => answer({ message: 'Hello, Ada!' }));
  await waitFor(() =>
    expect(result.current.greeting).toEqual({ status: 'success', message: 'Hello, Ada!' }),
  );
});

it('reports a failed request, then loads again when the same name is requested', async () => {
  let answer: (value: { message: string }) => void = () => undefined;
  const greet = jest
    .fn<Promise<{ message: string }>, [{ name: string }]>()
    .mockRejectedValueOnce(new Error('api down'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
  const { result } = renderGreeting(greet);

  act(() => result.current.requestGreeting('Ada'));
  await waitFor(() => expect(result.current.greeting).toEqual({ status: 'error' }));

  act(() => result.current.requestGreeting('Ada'));
  await waitFor(() => expect(result.current.greeting).toEqual({ status: 'loading' }));

  act(() => answer({ message: 'Hello, Ada!' }));
  await waitFor(() =>
    expect(result.current.greeting).toEqual({ status: 'success', message: 'Hello, Ada!' }),
  );
  expect(greet).toHaveBeenCalledTimes(2);
});
