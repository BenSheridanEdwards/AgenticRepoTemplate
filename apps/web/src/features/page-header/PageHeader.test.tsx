import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

it('renders the title as the page heading alongside its tagline', () => {
  render(<PageHeader title="Greeting" tagline="Enter a name and the api greets you back." />);

  expect(screen.getByRole('heading', { level: 1, name: 'Greeting' })).toBeInTheDocument();
  expect(screen.getByText('Enter a name and the api greets you back.')).toBeInTheDocument();
});
