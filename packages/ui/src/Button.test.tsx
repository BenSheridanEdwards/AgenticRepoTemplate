import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Button } from './Button';

it('renders a button that does not submit a form unless asked to', async () => {
  const handleSubmit = jest.fn((event: Event) => event.preventDefault());
  render(
    <form onSubmit={(event) => handleSubmit(event.nativeEvent)}>
      <Button>Plain</Button>
      <Button type="submit">Send</Button>
    </form>,
  );

  await userEvent.click(screen.getByRole('button', { name: 'Plain' }));
  expect(handleSubmit).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(handleSubmit).toHaveBeenCalledTimes(1);
});

it('calls its click handler and has no axe-detectable violations', async () => {
  const handleClick = jest.fn();
  const { container } = render(<Button onClick={handleClick}>Press</Button>);

  await userEvent.click(screen.getByRole('button', { name: 'Press' }));

  expect(handleClick).toHaveBeenCalledTimes(1);
  expect(await axe(container)).toHaveNoViolations();
});
