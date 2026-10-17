import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, saveFailed, addTodo, toggleTodo, deleteTodo } = useTodos();

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Todos</h1>
        <p className="app__tagline">Add a todo, tick it off when it is done, delete it.</p>
      </header>
      <section className="todos">
        <TodoForm onAdd={addTodo} />
        <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
        {saveFailed ? (
          <p role="alert" className="todos-error">
            Could not save the change
          </p>
        ) : null}
      </section>
    </main>
  );
}
