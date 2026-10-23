import { findAllTodos, findTodo, nextTodoId, removeTodo, saveTodo } from './integrations.ts';

it('saves, finds and removes a todo in memory', () => {
  const todo = { id: nextTodoId(), title: 'Buy milk', completed: false };

  saveTodo(todo);
  expect(findTodo(todo.id)).toEqual(todo);
  expect(findAllTodos()).toContainEqual(todo);

  expect(removeTodo(todo.id)).toEqual(todo);
  expect(findTodo(todo.id)).toBeUndefined();
  expect(removeTodo(todo.id)).toBeUndefined();
});

it('hands out a new id each time', () => {
  expect(nextTodoId()).not.toBe(nextTodoId());
});
