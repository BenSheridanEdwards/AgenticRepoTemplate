import { Button } from '@repo/ui';
import { TodoForm } from './TodoForm';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, isLoading, isError, isSaving, createTodo, toggleTodo, deleteTodo } = useTodos();
  return (
    <main className="app">
      <h1>Todos</h1>
      <section className="greeting" aria-label="Todo manager">
        <TodoForm onCreate={createTodo} />
        {isLoading ? <p role="status">Loading todos…</p> : null}
        {isError ? <p role="alert">Could not save or load todos. Please try again.</p> : null}
        <ul aria-label="Todos">
          {todos.map((todo) => (
            <li key={todo.id}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  disabled={isSaving}
                  onChange={() => toggleTodo(todo.id)}
                />
                {todo.title}
              </label>
              <Button
                aria-label={`Delete ${todo.title}`}
                disabled={isSaving}
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
