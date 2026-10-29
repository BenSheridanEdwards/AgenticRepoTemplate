import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { TextField } from './TextField';

it('labels its input and passes typed text through', async () => {
  const handleChange = jest.fn();
  render(<TextField label="Name" onChange={handleChange} />);

  const field = screen.getByRole('textbox', { name: 'Name' });
  await userEvent.type(field, 'Ada');

  expect(field).toHaveValue('Ada');
  expect(field).toBeValid();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('announces an error and ties it to the input', async () => {
  const { container } = render(<TextField label="Name" error="Enter a name" />);

  const field = screen.getByRole('textbox', { name: 'Name' });
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
  expect(field).toBeInvalid();
  expect(field).toHaveAccessibleDescription('Enter a name');
  expect(await axe(container)).toHaveNoViolations();
});

it('forwards a ref to the input', () => {
  const ref: React.RefObject<HTMLInputElement | null> = { current: null };
  render(<TextField label="Name" ref={ref} />);

  expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Name' }));
});

it('keeps the error tied to the input when the caller passes its own description', () => {
  render(<TextField label="Name" error="Enter a name" aria-describedby="elsewhere" />);

  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription('Enter a name');
});

it('adds a caller class name to its own', () => {
  render(<TextField label="Name" className="wide" />);

  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveClass('ui-text-field__input', 'wide');
});
