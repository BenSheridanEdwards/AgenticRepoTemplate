import { Button } from '@repo/ui';
import { TodoForm } from './TodoForm';
import { useTodos } from './useTodos';
export function TodosPage() {
  const { todos, loading, error, pending, busy, addTodo, toggleTodo, deleteTodo } = useTodos();
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Todos</h1>
        <p className="app__tagline">Keep track of what needs doing.</p>
      </header>
      <section className="greeting" aria-label="Todo tasks">
        <TodoForm onAdd={addTodo} pending={pending} />
        {loading ? <p role="status">Loading todos…</p> : null}
        {error ? <p role="alert">Could not save or load todos. Try again.</p> : null}
        <ul aria-label="Todos">
          {todos.map((todo) => (
            <li key={todo.id}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  disabled={busy}
                  onChange={() => toggleTodo(todo.id)}
                />
                {todo.title}
              </label>
              <Button
                aria-label={`Delete ${todo.title}`}
                disabled={busy}
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
