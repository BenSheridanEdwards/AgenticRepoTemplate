import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, createTodo, toggleTodo, deleteTodo } = useTodos();

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Todos</h1>
      </header>
      <section className="todos">
        <TodoForm onAdd={createTodo} />
        <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
      </section>
    </main>
  );
}
