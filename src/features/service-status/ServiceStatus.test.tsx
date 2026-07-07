import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ServiceStatus as ServiceStatusData } from './fetchServiceStatuses';
import { ServiceStatus } from './ServiceStatus';

/**
 * Tests assert on observable behaviour through the accessibility tree (roles,
 * the live status region) and visible text, never on implementation detail.
 * Each test stubs `fetch` to drive one of the four states the user can see:
 * loading, error, empty, and success. This mirrors the reference feature and
 * `.claude/skills/write-unit-tests/SKILL.md`.
 */

function stubFetch(response: Partial<Response> & { ok: boolean }) {
  global.fetch = jest.fn().mockResolvedValue(response as Response) as unknown as typeof fetch;
}

function stubPendingFetch() {
  global.fetch = jest
    .fn()
    .mockReturnValue(new Promise<Response>(() => {})) as unknown as typeof fetch;
}

const SAMPLE: ServiceStatusData[] = [
  { identifier: 'web', name: 'Web application', health: 'operational' },
  { identifier: 'api', name: 'Public API', health: 'degraded' },
];

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ServiceStatus', () => {
  it('shows a loading message while the request is in flight', () => {
    stubPendingFetch();

    render(<ServiceStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading service status');
  });

  it('lists each service with its health once the request succeeds', async () => {
    stubFetch({ ok: true, json: async () => SAMPLE });

    render(<ServiceStatus />);

    expect(await screen.findByText('Web application')).toBeInTheDocument();
    expect(screen.getByText('Operational')).toBeInTheDocument();
    expect(screen.getByText('Public API')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('shows an empty message when no services are monitored', async () => {
    stubFetch({ ok: true, json: async () => [] });

    render(<ServiceStatus />);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('No services are being monitored yet'),
    );
  });

  it('shows an error message when the request fails', async () => {
    stubFetch({ ok: false, status: 500, json: async () => ({}) });

    render(<ServiceStatus />);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Could not load service status'),
    );
  });

  it('refetches when the user presses Refresh', async () => {
    const user = userEvent.setup();
    stubFetch({ ok: true, json: async () => [] });

    render(<ServiceStatus />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('No services are being monitored yet'),
    );

    stubFetch({ ok: true, json: async () => SAMPLE });
    await user.click(screen.getByRole('button', { name: /refresh/i }));

    expect(await screen.findByText('Web application')).toBeInTheDocument();
  });
});
