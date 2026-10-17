import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TestApiProvider } from '../../api-client';
import { useGreeting } from './useGreeting';

function renderGreeting(greet: (input: { name: string }) => Promise<{ message: string }>) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider handlers={{ 'greeting.greet': greet }}>{children}</TestApiProvider>
  );
  return renderHook(() => useGreeting(), { wrapper });
}

it('stays idle and asks nothing until a name is requested', () => {
  const greet = jest.fn(async () => ({ message: 'unused' }));
  const { result } = renderGreeting(greet);

  expect(result.current.greeting).toEqual({ status: 'idle' });
  expect(greet).not.toHaveBeenCalled();
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

it('reports a failed request and asks again when the same name is requested', async () => {
  const greet = jest
    .fn<Promise<{ message: string }>, [{ name: string }]>()
    .mockRejectedValueOnce(new Error('api down'))
    .mockResolvedValueOnce({ message: 'Hello, Ada!' });
  const { result } = renderGreeting(greet);

  act(() => result.current.requestGreeting('Ada'));
  await waitFor(() => expect(result.current.greeting).toEqual({ status: 'error' }));

  act(() => result.current.requestGreeting('Ada'));
  await waitFor(() =>
    expect(result.current.greeting).toEqual({ status: 'success', message: 'Hello, Ada!' }),
  );
  expect(greet).toHaveBeenCalledTimes(2);
});
