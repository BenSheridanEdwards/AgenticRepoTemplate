import { fetchServiceStatuses, SERVICE_STATUS_ENDPOINT } from './fetchServiceStatuses';

// The fetch function is the untrusted IO boundary: it validates the response
// shape before handing back a typed value. These tests cover the happy path and
// each rejection branch, since a type assertion is not validation (CONVENTIONS.md).

function stubFetch(response: Partial<Response> & { ok: boolean }) {
  const fetchMock = jest.fn().mockResolvedValue(response as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchServiceStatuses', () => {
  it('requests the service-status endpoint and returns the parsed list', async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: async () => [{ identifier: 'web', name: 'Web application', health: 'operational' }],
    });

    const statuses = await fetchServiceStatuses();

    expect(fetchMock).toHaveBeenCalledWith(SERVICE_STATUS_ENDPOINT, expect.any(Object));
    expect(statuses).toEqual([
      { identifier: 'web', name: 'Web application', health: 'operational' },
    ]);
  });

  it('throws when the response is not ok', async () => {
    stubFetch({ ok: false, status: 502, json: async () => ({}) });

    await expect(fetchServiceStatuses()).rejects.toThrow('HTTP 502');
  });

  it('throws when the payload is not a list', async () => {
    stubFetch({ ok: true, json: async () => ({ services: [] }) });

    await expect(fetchServiceStatuses()).rejects.toThrow('was not a list');
  });

  it('throws when an item is not an object', async () => {
    stubFetch({ ok: true, json: async () => ['not-an-object'] });

    await expect(fetchServiceStatuses()).rejects.toThrow('must be an object');
  });

  it('throws when an item is missing its identifier or name', async () => {
    stubFetch({ ok: true, json: async () => [{ identifier: 'web', health: 'operational' }] });

    await expect(fetchServiceStatuses()).rejects.toThrow('identifier or name');
  });

  it('throws when an item has an unknown health value', async () => {
    stubFetch({
      ok: true,
      json: async () => [{ identifier: 'web', name: 'Web application', health: 'exploded' }],
    });

    await expect(fetchServiceStatuses()).rejects.toThrow('Unknown service health');
  });
});
