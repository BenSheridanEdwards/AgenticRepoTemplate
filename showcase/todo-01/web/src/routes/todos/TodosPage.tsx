import { PageHeader } from './PageHeader';
import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { TodosError } from './TodosError';
import { useTodos } from './useTodos';

export function TodosPage() {
  const { todos, loadFailed, saveFailed, addTodo, toggleTodo, deleteTodo } = useTodos();

  return (
    <main className="app">
      <PageHeader title="Todos" tagline="Add what you need to do, tick it off, delete it." />
      <section className="todos" aria-label="Todo list">
        <TodoForm onAdd={addTodo} />
        <TodosError loadFailed={loadFailed} saveFailed={saveFailed} />
        <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
      </section>
    </main>
  );
}
