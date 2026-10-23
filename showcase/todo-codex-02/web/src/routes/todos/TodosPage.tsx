import { TodoForm } from './TodoForm';
import { TodoItem } from './TodoItem';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, loading, error, pending, createTodo, toggleTodo, deleteTodo } = useTodos();
  return (
    <main className="app">
      <h1>Todos</h1>
      <TodoForm onCreate={createTodo} pending={pending} />
      {loading ? <p role="status">Loading todos…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <ul aria-label="Todos" className="todo-list">
        {todos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            pending={pending}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
          />
        ))}
      </ul>
    </main>
  );
}
