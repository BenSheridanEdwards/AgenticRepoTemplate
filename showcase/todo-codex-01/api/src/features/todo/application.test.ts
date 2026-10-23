import { createTodo, deleteTodo, listTodos, toggleComplete } from './application.ts';

it('creates, lists, toggles twice and deletes a todo in memory', () => {
  const todo = createTodo('  Read  ');
  expect(todo).toEqual({ id: expect.any(String), title: 'Read', completed: false });
  expect(listTodos()).toContainEqual(todo);
  expect(toggleComplete(todo.id)).toEqual({ ...todo, completed: true });
  expect(toggleComplete(todo.id)).toEqual(todo);
  deleteTodo(todo.id);
  expect(listTodos()).not.toContainEqual(todo);
  expect(toggleComplete(todo.id)).toBeUndefined();
  deleteTodo(todo.id);
});

it('does not store blank titles', () => {
  const before = listTodos();
  expect(() => createTodo('  ')).toThrow('Enter a title');
  expect(listTodos()).toEqual(before);
});
