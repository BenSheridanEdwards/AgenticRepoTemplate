import { ThresholdCounter } from './features/threshold-counter';

export function App() {
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Agentic Project Template</h1>
        <p className="app__tagline">
          A runnable showcase of the scaffolding that keeps agent-written code consistent.
        </p>
      </header>
      <ThresholdCounter />
    </main>
  );
}
