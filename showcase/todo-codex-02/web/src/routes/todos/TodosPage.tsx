import { Button } from '@repo/ui';
import { TodoForm } from './TodoForm';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, loading, error, busy, createTodo, toggleTodo, deleteTodo } = useTodos();

  return (
    <main className="app">
      <h1>Todos</h1>
      <TodoForm onCreate={createTodo} />
      {loading ? <p role="status">Loading todos…</p> : null}
      {error ? <p role="alert">Could not load or save todos. Please try again.</p> : null}
      <ul aria-label="Todos" className="todo-list">
        {todos.map((todo) => (
          <li key={todo.id}>
            <label>
              <input
                type="checkbox"
                checked={todo.completed}
                disabled={busy}
                onChange={() => toggleTodo(todo.id)}
              />
              <span className={todo.completed ? 'completed' : undefined}>{todo.title}</span>
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
    </main>
  );
}
