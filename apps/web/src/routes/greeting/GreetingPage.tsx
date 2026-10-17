import { GreetingForm } from './GreetingForm';
import { GreetingMessage } from './GreetingMessage';
import { useGreeting } from './useGreeting';

export function GreetingPage() {
  const { greeting, requestGreeting } = useGreeting();

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Greeting</h1>
        <p className="app__tagline">Enter a name and the api greets you back.</p>
      </header>
      <section className="greeting" aria-label="Greeting">
        <GreetingForm onGreet={requestGreeting} />
        <GreetingMessage greeting={greeting} />
      </section>
    </main>
  );
}
