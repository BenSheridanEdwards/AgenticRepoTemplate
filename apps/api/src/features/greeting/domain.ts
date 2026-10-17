export interface Greeting {
  readonly message: string;
}

export function formatGreeting(name: string): string {
  return `Hello, ${name}!`;
}
