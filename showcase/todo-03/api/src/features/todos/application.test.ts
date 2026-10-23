import {
  addTodo,
  deleteTodo,
  listTodos,
  TodoNotFoundError,
  toggleTodoById,
} from './application.ts';

it('adds a todo that is not complete and lists it', () => {
  const todo = addTodo({ title: 'Buy milk' });

  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(listTodos()).toContainEqual(todo);
});

it('toggles a todo complete and keeps the change', () => {
  const { id } = addTodo({ title: 'Walk the dog' });

  expect(toggleTodoById({ id })).toMatchObject({ id, completed: true });
  expect(listTodos()).toContainEqual(expect.objectContaining({ id, completed: true }));
});

it('deletes a todo', () => {
  const { id } = addTodo({ title: 'Water the plants' });

  expect(deleteTodo({ id })).toMatchObject({ id });

  expect(listTodos()).not.toContainEqual(expect.objectContaining({ id }));
});

it('rejects a toggle or delete of an unknown todo', () => {
  expect(() => toggleTodoById({ id: 'missing' })).toThrow(TodoNotFoundError);
  expect(() => deleteTodo({ id: 'missing' })).toThrow('No todo has the id missing');
});
