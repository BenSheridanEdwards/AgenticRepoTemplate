import { newTodoId, readTodo, readTodos, removeTodo, writeTodo } from './integrations.ts';

it('keeps written todos in memory until they are removed', () => {
  const todo = { id: newTodoId(), title: 'Buy milk', completed: false };

  writeTodo(todo);
  expect(readTodo(todo.id)).toEqual(todo);
  expect(readTodos()).toContainEqual(todo);

  expect(removeTodo(todo.id)).toBe(true);
  expect(readTodo(todo.id)).toBeUndefined();
  expect(removeTodo(todo.id)).toBe(false);
});

it('gives each todo a new id', () => {
  expect(newTodoId()).not.toBe(newTodoId());
});
