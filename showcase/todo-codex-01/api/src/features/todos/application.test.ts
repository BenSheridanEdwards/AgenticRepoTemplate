import { createTodo, deleteTodo, listTodos, toggleCompleted } from './application.ts';

it('creates, lists, toggles and deletes in process memory', () => {
  const todo = createTodo({ title: 'Read' });
  expect(todo).toEqual({ id: expect.any(String), title: 'Read', completed: false });
  expect(listTodos()).toContainEqual(todo);
  expect(toggleCompleted({ id: todo.id })).toEqual({ ...todo, completed: true });
  expect(toggleCompleted({ id: todo.id })).toEqual(todo);
  deleteTodo({ id: todo.id });
  expect(listTodos()).not.toContainEqual(todo);
  expect(toggleCompleted({ id: todo.id })).toBeUndefined();
  expect(() => deleteTodo({ id: todo.id })).not.toThrow();
});
