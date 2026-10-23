import { createTodo, deleteTodo, listTodos, TodoNotFoundError, toggleTodo } from './application.ts';

it('creates a todo not completed and lists it', () => {
  const todo = createTodo({ title: 'Buy milk' });

  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(listTodos()).toContainEqual(todo);
});

it('toggles a todo complete and back', () => {
  const { id } = createTodo({ title: 'Walk the dog' });

  expect(toggleTodo({ id }).completed).toBe(true);
  expect(listTodos()).toContainEqual({ id, title: 'Walk the dog', completed: true });
  expect(toggleTodo({ id }).completed).toBe(false);
});

it('deletes a todo', () => {
  const { id } = createTodo({ title: 'Water the plants' });

  expect(deleteTodo({ id })).toEqual({ id, title: 'Water the plants', completed: false });

  expect(listTodos().map((todo) => todo.id)).not.toContain(id);
});

it('fails to toggle or delete a todo it does not hold', () => {
  expect(() => toggleTodo({ id: 'missing' })).toThrow(TodoNotFoundError);
  expect(() => deleteTodo({ id: 'missing' })).toThrow(TodoNotFoundError);
});
