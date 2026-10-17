import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, saveFailed, addTodo, toggleTodo, deleteTodo } = useTodos();

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Todos</h1>
        <p className="app__tagline">Add what you need to do and tick it off when it is done.</p>
      </header>
      <section className="todos" aria-label="Todo list">
        <TodoForm onAdd={addTodo} />
        {saveFailed ? (
          <p role="alert" className="todo-error">
            Could not save the todo
          </p>
        ) : null}
        <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
      </section>
    </main>
  );
}
