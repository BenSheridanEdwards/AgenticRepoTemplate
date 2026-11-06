import { GreetingForm } from './GreetingForm';
import { GreetingMessage } from './GreetingMessage';
import { PageHeader } from './PageHeader';
import { useGreeting } from './useGreeting';

export function GreetingPage() {
  const { greeting, requestGreeting } = useGreeting();

  return (
    <main className="mx-auto max-w-160 px-4 py-6 sm:py-12">
      <PageHeader title="Greeting" tagline="Enter a name and the api greets you back." />
      <section
        className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6"
        aria-label="Greeting"
      >
        <GreetingForm onGreet={requestGreeting} />
        <GreetingMessage greeting={greeting} />
      </section>
    </main>
  );
}
