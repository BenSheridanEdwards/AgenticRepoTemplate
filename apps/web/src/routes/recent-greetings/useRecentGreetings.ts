import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTrpc } from '../../api-client';

export function useRecentGreetings() {
  const [enabled, setEnabled] = useState(false);
  const trpc = useTrpc();
  const query = useQuery(trpc.recentGreetings.list.queryOptions(undefined, { enabled }));

  function showRecentGreetings() {
    setEnabled(true);
    if (enabled) void query.refetch();
  }

  return { enabled, query, showRecentGreetings };
}
