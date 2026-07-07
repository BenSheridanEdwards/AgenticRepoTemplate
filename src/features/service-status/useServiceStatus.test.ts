import { act, renderHook, waitFor } from '@testing-library/react';
import type { ServiceStatus } from './fetchServiceStatuses';
import { useServiceStatus } from './useServiceStatus';

// The hook wires the network boundary to the shared async-resource machine.
// Each test stubs `fetch` to force one terminal state, then asserts the hook
// settles there. This covers the loading, success, empty, and error branches.

function stubFetch(response: Partial<Response> & { ok: boolean }) {
  const fetchMock = jest.fn().mockResolvedValue(response as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const SAMPLE: ServiceStatus[] = [
  { identifier: 'web', name: 'Web application', health: 'operational' },
];

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useServiceStatus', () => {
  it('starts in the loading state before the request resolves', () => {
    stubFetch({ ok: true, json: async () => SAMPLE });

    const { result } = renderHook(() => useServiceStatus());

    expect(result.current.state).toEqual({ status: 'loading' });
  });

  it('settles into success with the parsed list when the request returns services', async () => {
    stubFetch({ ok: true, json: async () => SAMPLE });

    const { result } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.state.status).toBe('success'));
    expect(result.current.state).toEqual({ status: 'success', value: SAMPLE });
  });

  it('settles into the empty state when no services are returned', async () => {
    stubFetch({ ok: true, json: async () => [] });

    const { result } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.state.status).toBe('empty'));
  });

  it('settles into the error state when the request fails', async () => {
    stubFetch({ ok: false, status: 503, json: async () => ({}) });

    const { result } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.state.status).toBe('error'));
    if (result.current.state.status !== 'error') {
      throw new Error('expected the error state');
    }
    expect(result.current.state.message).toContain('503');
  });

  it('reloads on demand, returning to loading before the next result', async () => {
    stubFetch({ ok: true, json: async () => SAMPLE });

    const { result } = renderHook(() => useServiceStatus());
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    stubFetch({ ok: true, json: async () => [] });
    act(() => result.current.reload());

    await waitFor(() => expect(result.current.state.status).toBe('empty'));
  });

  it('reports a fallback message when the failure is not an Error', async () => {
    global.fetch = jest.fn().mockRejectedValue('network offline') as unknown as typeof fetch;

    const { result } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.state.status).toBe('error'));
    if (result.current.state.status !== 'error') {
      throw new Error('expected the error state');
    }
    expect(result.current.state.message).toBe('Could not load service status');
  });
});
