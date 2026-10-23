import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

it('renders the title as the page heading alongside its tagline', () => {
  render(
    <PageHeader title="Todos" tagline="Add a todo, tick it off when it is done, delete it." />,
  );

  expect(screen.getByRole('heading', { level: 1, name: 'Todos' })).toBeInTheDocument();
  expect(
    screen.getByText('Add a todo, tick it off when it is done, delete it.'),
  ).toBeInTheDocument();
});
