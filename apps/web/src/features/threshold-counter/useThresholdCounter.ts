import { useCallback, useMemo, useState } from 'react';

export type ThresholdLevel = 'low' | 'warning' | 'critical';

export interface ThresholdStatus {
  level: ThresholdLevel;
  label: string;
}

export const WARNING_THRESHOLD = 4;
export const CRITICAL_THRESHOLD = 8;

/**
 * Pure, framework-free rule for turning a count into a status. Kept separate
 * from the hook so the business rule can be unit-tested in isolation and reused
 * (this is the convention in `.agents/project/CONVENTIONS.md`: logic lives in
 * pure functions, hooks only wire state).
 */
export function statusForCount(count: number): ThresholdStatus {
  if (count >= CRITICAL_THRESHOLD) {
    return { level: 'critical', label: 'At capacity' };
  }
  if (count >= WARNING_THRESHOLD) {
    return { level: 'warning', label: 'Approaching limit' };
  }
  return { level: 'low', label: 'Healthy' };
}

export interface UseThresholdCounter {
  count: number;
  status: ThresholdStatus;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export function useThresholdCounter(initial = 0): UseThresholdCounter {
  const [count, setCount] = useState(initial);

  const increment = useCallback(() => setCount((current) => current + 1), []);
  const decrement = useCallback(() => setCount((current) => Math.max(0, current - 1)), []);
  const reset = useCallback(() => setCount(initial), [initial]);

  const status = useMemo(() => statusForCount(count), [count]);

  return { count, status, increment, decrement, reset };
}
