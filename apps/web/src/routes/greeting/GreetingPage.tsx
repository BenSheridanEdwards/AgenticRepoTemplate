import { GreetingForm } from './GreetingForm';
import { GreetingMessage } from './GreetingMessage';
import { PageHeader } from './PageHeader';
import { useGreeting } from './useGreeting';

export function GreetingPage() {
  const { greeting, requestGreeting } = useGreeting();

  return (
    <main className="app">
      <PageHeader title="Greeting" tagline="Enter a name and the api greets you back." />
      <section className="greeting" aria-label="Greeting">
        <GreetingForm onGreet={requestGreeting} />
        <GreetingMessage greeting={greeting} />
      </section>
    </main>
  );
}
