import { createTodo, deleteTodo, listTodos, TodoNotFoundError, toggleTodo } from './application.ts';

it('creates a todo not completed and lists it', () => {
  const todo = createTodo({ title: 'Buy milk' });

  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(listTodos()).toContainEqual(todo);
});

it('toggles a todo complete and back', () => {
  const { id } = createTodo({ title: 'Walk the dog' });

  expect(toggleTodo({ id })).toMatchObject({ id, completed: true });
  expect(listTodos()).toContainEqual({ id, title: 'Walk the dog', completed: true });
  expect(toggleTodo({ id })).toMatchObject({ id, completed: false });
});

it('deletes a todo', () => {
  const todo = createTodo({ title: 'Water the plants' });

  expect(deleteTodo({ id: todo.id })).toEqual(todo);

  expect(listTodos()).not.toContainEqual(todo);
});

it('fails to toggle or delete a todo that does not exist', () => {
  expect(() => toggleTodo({ id: 'missing' })).toThrow(TodoNotFoundError);
  expect(() => deleteTodo({ id: 'missing' })).toThrow(TodoNotFoundError);
});

it('names the missing id in its error', () => {
  expect(new TodoNotFoundError('42')).toMatchObject({
    name: 'TodoNotFoundError',
    message: 'No todo has the id 42',
  });
});
