export interface RecentGreetings {
  readonly names: readonly string[];
}

export const RECENT_GREETINGS_LIMIT = 10;

export function addRecentName(names: readonly string[], name: string): readonly string[] {
  return [name, ...names].slice(0, RECENT_GREETINGS_LIMIT);
}
