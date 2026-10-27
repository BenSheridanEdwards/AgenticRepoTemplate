import { GreetingPage } from './routes/greeting';
import { TodosPage } from './routes/todos';

export function App() {
  return typeof window !== 'undefined' && window.location.pathname === '/todos' ? (
    <TodosPage />
  ) : (
    <GreetingPage />
  );
}
