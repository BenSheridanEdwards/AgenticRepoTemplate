import { Button } from '@repo/ui';
import { TodoForm } from './TodoForm';
import { useTodos } from './useTodos';

export function TodoPage() {
  const { todos, loading, error, create, toggle, remove, pending } = useTodos();
  return (
    <main className="app">
      <h1>Todos</h1>
      <section className="greeting" aria-label="Manage todos">
        <TodoForm onCreate={create} pending={pending} />
        {loading ? <p role="status">Loading todos…</p> : null}
        {error ? <p role="alert">Could not save or load todos. Please try again.</p> : null}
        <ul aria-label="Todos">
          {todos.map((todo) => (
            <li key={todo.id}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  disabled={pending}
                  onChange={() => toggle({ id: todo.id })}
                />
                {todo.title}
              </label>
              <Button
                aria-label={`Delete ${todo.title}`}
                disabled={pending}
                onClick={() => remove({ id: todo.id })}
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
