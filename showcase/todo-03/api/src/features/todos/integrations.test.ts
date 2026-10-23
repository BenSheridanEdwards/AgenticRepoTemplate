import { nextTodoId, readTodo, readTodos, removeTodo, writeTodo } from './integrations.ts';

it('keeps written todos in memory until they are removed', () => {
  const todo = { id: nextTodoId(), title: 'Buy milk', completed: false };

  writeTodo(todo);

  expect(readTodo(todo.id)).toEqual(todo);
  expect(readTodos()).toContainEqual(todo);
  removeTodo(todo.id);
  expect(readTodo(todo.id)).toBeUndefined();
});

it('hands out a new id each time', () => {
  expect(nextTodoId()).not.toBe(nextTodoId());
});
