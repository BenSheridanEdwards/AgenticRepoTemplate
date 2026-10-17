import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { GreetingPage } from './GreetingPage';

function renderPage(greet: NonNullable<TestApiHandlers['greeting.greet']>) {
  const view = render(
    <TestApiProvider handlers={{ 'greeting.greet': greet }}>
      <GreetingPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

async function submitName(user: ReturnType<typeof userEvent.setup>, name: string) {
  const field = screen.getByRole('textbox', { name: 'Name' });
  await user.clear(field);
  if (name) {
    await user.type(field, name);
  }
  await user.click(screen.getByRole('button', { name: 'Greet' }));
}

it('greets the submitted name through the api', async () => {
  const greet = jest.fn(({ name }: { name: string }) => ({ message: `Hello, ${name}!` }));
  const { user } = renderPage(greet);

  await submitName(user, '  Ada ');

  expect(await screen.findByRole('status')).toHaveTextContent('Hello, Ada!');
  expect(greet).toHaveBeenCalledWith({ name: 'Ada' });
});

it.each(['', '   '])('asks for a name and sends nothing when the name is %j', async (name) => {
  const greet = jest.fn(() => ({ message: 'unused' }));
  const { user } = renderPage(greet);

  await submitName(user, name);

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name');
  expect(screen.getByRole('textbox', { name: 'Name' })).toBeInvalid();
  expect(greet).not.toHaveBeenCalled();
});

it('says so when the api fails', async () => {
  const { user } = renderPage(() => Promise.reject(new Error('api down')));

  await submitName(user, 'Ada');

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the greeting');
});

it('has no axe-detectable violations with a validation error showing', async () => {
  const { container, user } = renderPage(() => ({ message: 'unused' }));

  await submitName(user, '');
  await screen.findByRole('alert');

  expect(await axe(container)).toHaveNoViolations();
});
