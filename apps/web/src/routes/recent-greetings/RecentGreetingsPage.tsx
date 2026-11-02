import { Button } from '@repo/ui';
import { useRecentGreetings } from './useRecentGreetings';

export function RecentGreetingsPage() {
  const { enabled, query, showRecentGreetings } = useRecentGreetings();
  const greetings = query.data?.names.map((name, index, names) => ({
    name,
    key: JSON.stringify(names.slice(index)),
  }));

  return (
    <section className="app" aria-label="Recent greetings">
      <h2>Recent greetings</h2>
      <Button onClick={showRecentGreetings}>Show recent greetings</Button>
      {enabled && query.isError && <p role="alert">Could not load recent greetings</p>}
      {enabled &&
        query.isSuccess &&
        (query.data.names.length === 0 ? (
          <p>No greetings yet</p>
        ) : (
          <ul>
            {greetings?.map(({ name, key }) => (
              <li key={key}>{name}</li>
            ))}
          </ul>
        ))}
    </section>
  );
}
