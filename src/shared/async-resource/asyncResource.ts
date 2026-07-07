/**
 * A framework-free model of a single asynchronous read: the four states any
 * fetch passes through, expressed as a discriminated union so the compiler
 * forces every consumer to handle each case. This lives in `src/shared/`
 * because it is not owned by any one feature: it is the shared contract for
 * async data, and features may import it through this module's public surface
 * (see `.agents/project/ARCHITECTURE.md`). Features must never import each
 * other, but they may both depend on shared code like this.
 */

export type AsyncResourceState<Value> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'empty' }
  | { readonly status: 'success'; readonly value: Value };

/**
 * Classify a resolved list into the terminal state a view should render. An
 * empty list is a first-class outcome, not an error and not a bare success, so
 * a view can show a distinct "nothing here yet" surface rather than a blank
 * success. Kept as a pure function so it is unit-testable without rendering.
 */
export function resolveListState<Item>(
  items: readonly Item[],
): AsyncResourceState<readonly Item[]> {
  if (items.length === 0) {
    return { status: 'empty' };
  }
  return { status: 'success', value: items };
}
