import { TodoForm } from './TodoForm';
import { TodoItem } from './TodoItem';
import { useTodos } from './useTodos';
import './todos.css';

export function TodosPage() {
  const { todos, isLoading, loadError, changeError, isChanging, addTodo, toggleTodo, deleteTodo } =
    useTodos();
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Todos</h1>
        <p className="app__tagline">Keep track of what needs doing.</p>
      </header>
      <section className="todos" aria-label="Todo tasks">
        <TodoForm onAdd={addTodo} />
        {isLoading ? <p role="status">Loading todos…</p> : null}
        {loadError ? <p role="alert">Could not load todos</p> : null}
        {changeError ? <p role="alert">Could not update todo. Try again.</p> : null}
        <ul className="todos-list" aria-label="Todos">
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              disabled={isChanging}
              onToggle={toggleTodo}
              onDelete={deleteTodo}
            />
          ))}
        </ul>
      </section>
    </main>
  );
}
