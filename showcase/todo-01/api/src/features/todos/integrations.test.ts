import { eraseTodo, nextTodoId, readTodo, readTodos, writeTodo } from './integrations.ts';

it('stores, reads and erases todos in memory', () => {
  const todo = { id: nextTodoId(), title: 'Buy milk', completed: false };

  writeTodo(todo);

  expect(readTodos()).toEqual([todo]);
  expect(readTodo(todo.id)).toEqual(todo);
  eraseTodo(todo.id);
  expect(readTodos()).toEqual([]);
});

it('gives each todo its own id', () => {
  expect(nextTodoId()).not.toBe(nextTodoId());
});
