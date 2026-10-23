import { PageHeader } from './PageHeader';
import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, saveFailed, addTodo, toggleTodo, deleteTodo } = useTodos();

  return (
    <main className="app">
      <PageHeader title="Todos" tagline="Add what needs doing, tick it off, delete it." />
      <section className="todos" aria-label="Todo list">
        <TodoForm onAdd={addTodo} />
        {saveFailed ? (
          <p role="alert" className="todo-error">
            Could not save the change
          </p>
        ) : null}
        <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
      </section>
    </main>
  );
}
