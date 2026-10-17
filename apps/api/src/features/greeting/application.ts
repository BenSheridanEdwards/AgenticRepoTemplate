import { formatGreeting, type Greeting } from './domain.ts';

export interface GreetRequest {
  readonly name: string;
}

export function greet(request: GreetRequest): Greeting {
  return { message: formatGreeting(request.name) };
}
