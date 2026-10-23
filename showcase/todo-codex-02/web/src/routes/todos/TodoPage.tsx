import { Button } from '@repo/ui';
import { TodoForm } from './TodoForm';
import { useTodos } from './useTodos';
export function TodoPage() {
  const { query, create, toggle, remove } = useTodos();
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Todos</h1>
        <p className="app__tagline">A little space for what needs doing.</p>
      </header>
      <section className="greeting" aria-label="Todo tasks">
        <TodoForm onAdd={(title) => create.mutateAsync({ title })} />
        {query.isPending && <p role="status">Loading todos…</p>}
        {(query.isError || create.isError || toggle.isError || remove.isError) && (
          <p role="alert">Could not save or load todos. Please try again.</p>
        )}
        <ul aria-label="Todos">
          {query.data?.map((todo) => (
            <li key={todo.id}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  disabled={toggle.isPending}
                  onChange={() => toggle.mutate({ id: todo.id })}
                />
                {todo.title}
              </label>
              <Button
                aria-label={`Delete ${todo.title}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: todo.id })}
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
