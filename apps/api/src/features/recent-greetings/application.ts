import { addRecentName, type RecentGreetings } from './domain.ts';
import { createInMemoryRecentNames } from './integrations.ts';

const store = createInMemoryRecentNames();

export function recordGreeting(request: { readonly name: string }): RecentGreetings {
  store.write(addRecentName(store.read(), request.name));
  return listRecentGreetings();
}

export function listRecentGreetings(): RecentGreetings {
  return { names: store.read() };
}
