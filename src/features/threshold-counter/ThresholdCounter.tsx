import { CRITICAL_THRESHOLD, useThresholdCounter } from './useThresholdCounter';

/**
 * The one "minimal but real" feature. It exists so every quality gate fires on
 * genuine code: branchy logic for the unit suite, a clickable flow for the E2E
 * behaviour map, and a status pill that recolours by state for StyleProof.
 */
export function ThresholdCounter() {
  const { count, status, increment, decrement, reset } = useThresholdCounter();

  return (
    <section className="threshold-counter" aria-labelledby="threshold-counter-heading">
      <h2 id="threshold-counter-heading" className="threshold-counter__heading">
        Capacity
      </h2>

      <p className="threshold-counter__count" data-testid="count">
        <span className="threshold-counter__count-value">{count}</span>
        <span className="threshold-counter__count-limit">/ {CRITICAL_THRESHOLD}</span>
      </p>

      {/* <output> carries an implicit ARIA `status` role (a polite live region),
          so screen readers announce status changes — and getByRole('status')
          resolves it in both the unit and E2E suites. */}
      <output className={`threshold-counter__pill threshold-counter__pill--${status.level}`}>
        {status.label}
      </output>

      <div className="threshold-counter__actions">
        <button type="button" className="threshold-counter__button" onClick={decrement}>
          Decrease
        </button>
        <button type="button" className="threshold-counter__button" onClick={increment}>
          Increase
        </button>
        <button
          type="button"
          className="threshold-counter__button threshold-counter__button--ghost"
          onClick={reset}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
