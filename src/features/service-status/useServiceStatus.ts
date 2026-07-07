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

export function useServiceStatus(): UseServiceStatus {
  const [state, setState] = useState<AsyncResourceState<readonly ServiceStatus[]>>({
    status: 'loading',
  });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const statuses = await fetchServiceStatuses();
      setState(resolveListState(statuses));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load service status';
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { state, reload };
}
