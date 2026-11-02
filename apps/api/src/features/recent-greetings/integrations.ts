import type { RecentGreetings } from './domain.ts';

interface RecentNamesState {
  names: RecentGreetings['names'];
}

export function createInMemoryRecentNames() {
  const state: RecentNamesState = { names: [] };
  return {
    read: (): RecentGreetings['names'] => [...state.names],
    write: (names: RecentGreetings['names']): void => {
      state.names = [...names];
    },
  };
}
