export function PageHeader({
  title,
  tagline,
}: {
  readonly title: string;
  readonly tagline: string;
}) {
  return (
    <header className="app__header">
      <h1 className="app__title">{title}</h1>
      <p className="app__tagline">{tagline}</p>
    </header>
  );
}
