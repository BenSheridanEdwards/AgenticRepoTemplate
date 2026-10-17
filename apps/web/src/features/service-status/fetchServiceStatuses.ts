/**
 * The network boundary for this feature. It fetches a small list of service
 * statuses over HTTP, which means an end-to-end test can intercept the request
 * at the network layer (Playwright `page.route`) and deterministically drive
 * the loading, success, empty, and error paths without a live backend.
 *
 * Data crossing this IO boundary is untrusted, so it is validated shape-by-
 * shape before it is handed back as a typed value: a type assertion is not
 * validation (see `.agents/project/CONVENTIONS.md`).
 */

export type ServiceHealth = 'operational' | 'degraded' | 'down';

export interface ServiceStatus {
  readonly identifier: string;
  readonly name: string;
  readonly health: ServiceHealth;
}

// A relative path so the app can be served from any origin. In production this
// would be a real endpoint; here it is the seam every test intercepts.
export const SERVICE_STATUS_ENDPOINT = '/api/service-status';

const KNOWN_HEALTH_VALUES: readonly ServiceHealth[] = ['operational', 'degraded', 'down'];

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null;
}

function parseServiceStatus(candidate: unknown): ServiceStatus {
  if (!isRecord(candidate)) {
    throw new Error('Each service status must be an object');
  }
  const { identifier, name, health } = candidate;
  if (typeof identifier !== 'string' || typeof name !== 'string') {
    throw new Error('A service status is missing its identifier or name');
  }
  if (typeof health !== 'string' || !KNOWN_HEALTH_VALUES.includes(health as ServiceHealth)) {
    throw new Error(`Unknown service health value: ${String(health)}`);
  }
  return { identifier, name, health: health as ServiceHealth };
}

export async function fetchServiceStatuses(): Promise<readonly ServiceStatus[]> {
  const response = await fetch(SERVICE_STATUS_ENDPOINT, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Service status request failed with HTTP ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Service status response was not a list');
  }
  return payload.map(parseServiceStatus);
}
