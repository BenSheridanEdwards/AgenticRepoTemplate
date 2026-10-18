import { createTodo, deleteTodo, listTodos, TodoNotFoundError, toggleTodo } from './application.ts';

it('creates todos with their own ids and lists them in creation order', () => {
  const first = createTodo({ title: 'Buy milk' });
  const second = createTodo({ title: 'Walk the dog' });

  expect(first).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(second.id).not.toBe(first.id);
  expect(listTodos()).toEqual([first, second]);
});

it('toggles a stored todo complete and back', () => {
  const todo = createTodo({ title: 'Water the plants' });

  expect(toggleTodo({ id: todo.id })).toEqual({ ...todo, completed: true });
  expect(listTodos()).toContainEqual({ ...todo, completed: true });
  expect(toggleTodo({ id: todo.id })).toEqual(todo);
});

it('deletes a stored todo', () => {
  const todo = createTodo({ title: 'Read a book' });

  expect(deleteTodo({ id: todo.id })).toEqual({ id: todo.id });
  expect(listTodos()).not.toContainEqual(todo);
});

it('refuses to toggle or delete a todo that does not exist', () => {
  expect(() => toggleTodo({ id: 'missing' })).toThrow(TodoNotFoundError);
  expect(() => deleteTodo({ id: 'missing' })).toThrow(TodoNotFoundError);
});
