import { Button } from '@repo/ui';
import { TodoForm } from './TodoForm';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, loading, error, create, toggle, deleteTodo, saving } = useTodos();
  return (
    <main className="app">
      <h1>Todos</h1>
      <section className="todos" aria-label="Your todos">
        <TodoForm onCreate={create} />
        {loading ? <p role="status">Loading todos…</p> : null}
        {error ? <p role="alert">Could not save or load todos. Please try again.</p> : null}
        <ul aria-label="Todos">
          {todos.map((todo) => (
            <li key={todo.id}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  disabled={saving}
                  onChange={() => toggle(todo.id)}
                />
                {todo.title}
              </label>
              <Button
                aria-label={`Delete ${todo.title}`}
                disabled={saving}
                onClick={() => deleteTodo(todo.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
