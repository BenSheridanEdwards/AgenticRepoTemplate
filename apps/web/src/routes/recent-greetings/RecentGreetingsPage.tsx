import { Button } from '@repo/ui';
import { useRecentGreetings } from './useRecentGreetings';

export function RecentGreetingsPage() {
  const { enabled, query, showRecentGreetings } = useRecentGreetings();
  const greetings = query.data?.names.map((name, index, names) => ({
    name,
    key: JSON.stringify(names.slice(index)),
  }));

  return (
    <section className="mx-auto max-w-160 px-4 py-6 sm:py-12" aria-label="Recent greetings">
      <h2 className="my-5 text-2xl font-bold">Recent greetings</h2>
      <Button onClick={showRecentGreetings}>Show recent greetings</Button>
      {enabled && query.isError && (
        <p role="alert" className="my-4 text-danger">
          Could not load recent greetings
        </p>
      )}
      {enabled &&
        query.isSuccess &&
        (query.data.names.length === 0 ? (
          <p className="my-4">No greetings yet</p>
        ) : (
          <ul className="my-4 list-disc pl-10">
            {greetings?.map(({ name, key }) => (
              <li key={key}>{name}</li>
            ))}
          </ul>
        ))}
    </section>
  );
}
