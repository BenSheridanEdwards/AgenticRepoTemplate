import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, addTodo, toggleTodo, deleteTodo } = useTodos();

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Todos</h1>
        <p className="app__tagline">
          Add a todo, check it off, and delete the ones you are done with.
        </p>
      </header>
      <section className="todos">
        <TodoForm onAdd={addTodo} />
        <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
      </section>
    </main>
  );
}
