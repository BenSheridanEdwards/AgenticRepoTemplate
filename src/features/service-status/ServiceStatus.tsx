import type { ServiceHealth } from './fetchServiceStatuses';
import { useServiceStatus } from './useServiceStatus';

/**
 * The second "minimal but real" feature: an async service-status list that
 * renders four distinct, observable states (loading, error, empty, success).
 * It exists so the gates fire on genuine async surfaces: a route/data seam the
 * E2E map can intercept, error and empty branches for the unit suite, and a
 * health pill that recolours by state for StyleProof.
 *
 * A component only renders. All state lives in `useServiceStatus`; all parsing
 * lives in `fetchServiceStatuses` (see `.agents/project/ARCHITECTURE.md`).
 */

const HEALTH_LABELS: Record<ServiceHealth, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
};

export function ServiceStatus() {
  const { state, reload } = useServiceStatus();

  return (
    <section className="service-status" aria-labelledby="service-status-heading">
      <div className="service-status__bar">
        <h2 id="service-status-heading" className="service-status__heading">
          Service status
        </h2>
        <button type="button" className="service-status__button" onClick={reload}>
          Refresh
        </button>
      </div>

      {/* One live region announces every terminal state to assistive tech, and
          getByRole('status') resolves it in the unit and E2E suites. */}
      <output className="service-status__region">
        {state.status === 'loading' && (
          <p className="service-status__message">Loading service status…</p>
        )}

        {state.status === 'error' && (
          <p className="service-status__message service-status__message--error">
            Could not load service status. {state.message}
          </p>
        )}

        {state.status === 'empty' && (
          <p className="service-status__message service-status__message--empty">
            No services are being monitored yet.
          </p>
        )}

        {state.status === 'success' && (
          <ul className="service-status__list">
            {state.value.map((service) => (
              <li key={service.identifier} className="service-status__item">
                <span className="service-status__name">{service.name}</span>
                <span className={`service-status__pill service-status__pill--${service.health}`}>
                  {HEALTH_LABELS[service.health]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </output>
    </section>
  );
}
