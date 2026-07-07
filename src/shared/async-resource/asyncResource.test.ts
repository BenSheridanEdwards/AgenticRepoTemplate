import { resolveListState } from './asyncResource';

// The shared list-state rule is a pure function kept apart from any hook so it
// can be tested in isolation (see ARCHITECTURE.md). An empty list is its own
// terminal state, distinct from a populated success.
describe('resolveListState', () => {
  it('classifies an empty list as the empty state', () => {
    expect(resolveListState([])).toEqual({ status: 'empty' });
  });

  it('classifies a populated list as success carrying the items', () => {
    const items = ['first', 'second'];

    expect(resolveListState(items)).toEqual({ status: 'success', value: items });
  });
});
