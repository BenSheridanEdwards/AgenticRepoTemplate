import type { GreetingState } from './useGreeting';

const STATUS_TEXT = { idle: '', loading: 'Loading…', error: '' } as const;

export function GreetingMessage({ greeting }: { readonly greeting: GreetingState }) {
  return (
    <>
      <output className="greeting-message">
        {greeting.status === 'success' ? greeting.message : STATUS_TEXT[greeting.status]}
      </output>
      {greeting.status === 'error' ? (
        <p role="alert" className="greeting-error">
          Could not load the greeting
        </p>
      ) : null}
    </>
  );
}
