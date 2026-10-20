import { addTodo, listTodos, removeTodo, toggleTodo } from './application.ts';

it('adds a todo and lists it', () => {
  const todo = addTodo('Walk the dog');

  expect(todo).toMatchObject({ title: 'Walk the dog', completed: false });
  expect(listTodos()).toContainEqual(todo);
});

it('toggles a stored todo and reports a missing one', () => {
  const todo = addTodo('Water the plants');

  const toggled = toggleTodo(todo.id);

  expect(toggled).toMatchObject({ id: todo.id, completed: true });
  expect(listTodos()).toContainEqual(toggled);
  expect(toggleTodo('missing-id')).toBeUndefined();
});

it('removes a stored todo and reports a missing one', () => {
  const todo = addTodo('Read a book');

  expect(removeTodo(todo.id)).toBe(true);
  expect(listTodos()).not.toContainEqual(todo);
  expect(removeTodo('missing-id')).toBe(false);
});
