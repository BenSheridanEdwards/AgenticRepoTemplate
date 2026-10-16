import { useCallback, useEffect, useState } from 'react';
import type { AsyncResourceState } from '../../shared/async-resource';
import { resolveListState } from '../../shared/async-resource';
import { fetchServiceStatuses, type ServiceStatus } from './fetchServiceStatuses';

/**
 * State wiring for the service-status feature. The hook only orchestrates: it
 * drives the shared `AsyncResourceState` machine (loading, error, empty,
 * success) around the network boundary and re-runs on demand. It holds no view
 * markup and no parsing rules; those live in the component and the fetch
 * function respectively (see `.agents/project/ARCHITECTURE.md`).
 */

export interface UseServiceStatus {
  state: AsyncResourceState<readonly ServiceStatus[]>;
  reload: () => void;
}

/** Resolves to the terminal state for one request; it never rejects. */
async function requestServiceStatuses(): Promise<AsyncResourceState<readonly ServiceStatus[]>> {
  try {
    return resolveListState(await fetchServiceStatuses());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load service status';
    return { status: 'error', message };
  }
}

export function useServiceStatus(): UseServiceStatus {
  const [state, setState] = useState<AsyncResourceState<readonly ServiceStatus[]>>({
    status: 'loading',
  });

  // State starts as `loading`, so the mount effect only applies the result.
  useEffect(() => {
    void requestServiceStatuses().then(setState);
  }, []);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    void requestServiceStatuses().then(setState);
  }, []);

  return { state, reload };
}
