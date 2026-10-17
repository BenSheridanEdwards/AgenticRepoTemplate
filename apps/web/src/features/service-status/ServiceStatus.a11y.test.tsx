import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ServiceStatus } from './ServiceStatus';

// Accessibility is a correctness concern, including in the failure states.
// jest-axe catches structural/ARIA violations at the unit level for each async
// state; the real-browser scan in e2e/accessibility.spec.ts adds colour
// contrast, which jsdom cannot compute.

function stubFetch(response: Partial<Response> & { ok: boolean }) {
  global.fetch = jest.fn().mockResolvedValue(response as Response) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
});

it('has no axe violations in the success state', async () => {
  stubFetch({
    ok: true,
    json: async () => [{ identifier: 'web', name: 'Web application', health: 'operational' }],
  });
  const { container } = render(<ServiceStatus />);
  await screen.findByText('Web application');

  expect(await axe(container)).toHaveNoViolations();
});

it('has no axe violations in the empty state', async () => {
  stubFetch({ ok: true, json: async () => [] });
  const { container } = render(<ServiceStatus />);
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('No services are being monitored yet'),
  );

  expect(await axe(container)).toHaveNoViolations();
});

it('has no axe violations in the error state', async () => {
  stubFetch({ ok: false, status: 500, json: async () => ({}) });
  const { container } = render(<ServiceStatus />);
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Could not load service status'),
  );

  expect(await axe(container)).toHaveNoViolations();
});
