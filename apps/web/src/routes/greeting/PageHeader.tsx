export function PageHeader({
  title,
  tagline,
}: {
  readonly title: string;
  readonly tagline: string;
}) {
  return (
    <header className="mb-8">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-base text-muted">{tagline}</p>
    </header>
  );
}
