import { PageHeader } from '../../features/page-header';
import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, saveFailed, addTodo, toggleTodo, deleteTodo } = useTodos();

  return (
    <main className="app">
      <PageHeader title="Todos" tagline="Add a todo, tick it off when it is done." />
      <section className="todos">
        <TodoForm onAdd={addTodo} />
        {saveFailed ? (
          <p role="alert" className="todos-error">
            Could not save the change
          </p>
        ) : null}
        <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
      </section>
    </main>
  );
}
