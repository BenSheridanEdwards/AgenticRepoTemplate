import { Button } from '@repo/ui';
import { TodoForm } from './TodoForm';
import { useTodos } from './useTodos';
export function TodoPage() {
  const { todos, loading, error, create, toggle, remove } = useTodos();
  return (
    <main className="app">
      <h1>Todos</h1>
      <section className="greeting" aria-label="Todo manager">
        <TodoForm onCreate={(title) => create.mutateAsync({ title })} pending={create.isPending} />
        {loading && <p role="status">Loading todos…</p>}
        {error && <p role="alert">Could not save or load todos. Please try again.</p>}
        <ul aria-label="Todos">
          {todos.map((todo) => (
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
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: todo.id })}
              >
                Delete {todo.title}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
