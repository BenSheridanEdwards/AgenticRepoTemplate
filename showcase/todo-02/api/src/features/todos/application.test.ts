import { addTodo, deleteTodo, listTodos, toggleTodoById } from './application.ts';

it('adds a todo that is not completed and lists it', () => {
  const todo = addTodo({ title: 'Buy milk' });

  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(listTodos()).toContainEqual(todo);
});

it('toggles a stored todo and keeps the new state', () => {
  const todo = addTodo({ title: 'Walk the dog' });

  expect(toggleTodoById({ id: todo.id })).toEqual({ ...todo, completed: true });
  expect(listTodos()).toContainEqual({ ...todo, completed: true });
});

it('deletes a stored todo', () => {
  const todo = addTodo({ title: 'Water the plants' });

  expect(deleteTodo({ id: todo.id })).toBe(true);
  expect(listTodos()).not.toContainEqual(todo);
});

it('finds no todo for an unknown id', () => {
  expect(toggleTodoById({ id: 'missing' })).toBeUndefined();
  expect(deleteTodo({ id: 'missing' })).toBe(false);
});
