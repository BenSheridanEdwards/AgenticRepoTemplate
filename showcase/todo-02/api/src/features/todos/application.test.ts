import { addTodo, deleteTodo, listTodos, TodoNotFoundError, toggleTodo } from './application.ts';

it('adds a todo that is not completed and lists it', () => {
  const todo = addTodo({ title: 'Buy milk' });

  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(listTodos()).toContainEqual(todo);
});

it('toggles a todo complete and back', () => {
  const { id } = addTodo({ title: 'Walk the dog' });

  expect(toggleTodo({ id }).completed).toBe(true);
  expect(toggleTodo({ id }).completed).toBe(false);
});

it('deletes a todo', () => {
  const { id } = addTodo({ title: 'Water the plants' });

  deleteTodo({ id });

  expect(listTodos().map((todo) => todo.id)).not.toContain(id);
});

it('fails to toggle or delete a todo that does not exist', () => {
  expect(() => toggleTodo({ id: 'missing' })).toThrow(TodoNotFoundError);
  expect(() => deleteTodo({ id: 'missing' })).toThrow('No todo has the id missing');
});
