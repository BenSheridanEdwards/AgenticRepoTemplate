import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

it('renders the title as the page heading alongside its tagline', () => {
  render(<PageHeader title="Todos" tagline="Add what needs doing, tick it off, delete it." />);

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  expect(screen.getByText('Add what needs doing, tick it off, delete it.')).toBeInTheDocument();
});
