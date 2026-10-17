import { act, renderHook } from '@testing-library/react';
import {
  CRITICAL_THRESHOLD,
  statusForCount,
  type ThresholdLevel,
  useThresholdCounter,
  WARNING_THRESHOLD,
} from './useThresholdCounter';

// The pure rule is kept apart from the hook precisely so it can be tested in
// isolation (see ARCHITECTURE.md). Cover every branch at the boundaries.
describe('statusForCount', () => {
  const cases: Array<[number, ThresholdLevel, string]> = [
    [0, 'low', 'Healthy'],
    [WARNING_THRESHOLD - 1, 'low', 'Healthy'],
    [WARNING_THRESHOLD, 'warning', 'Approaching limit'],
    [CRITICAL_THRESHOLD - 1, 'warning', 'Approaching limit'],
    [CRITICAL_THRESHOLD, 'critical', 'At capacity'],
    [CRITICAL_THRESHOLD + 1, 'critical', 'At capacity'],
  ];

  it.each(cases)('maps count %i to the %s level', (count, level, label) => {
    expect(statusForCount(count)).toEqual({ level, label });
  });
});

describe('useThresholdCounter', () => {
  it('increments, floors decrement at zero, and resets to the initial value', () => {
    const { result } = renderHook(() => useThresholdCounter(2));

    expect(result.current.count).toBe(2);

    act(() => result.current.decrement());
    act(() => result.current.decrement());
    act(() => result.current.decrement()); // already at 0 — floored, never negative
    expect(result.current.count).toBe(0);

    act(() => result.current.increment());
    expect(result.current.count).toBe(1);

    act(() => result.current.reset()); // back to the non-zero initial, not zero
    expect(result.current.count).toBe(2);
  });
});
