import { newTodoId, readTodo, readTodos, removeTodo, writeTodo } from './integrations.ts';

it('makes a new id each time', () => {
  expect(newTodoId()).not.toBe(newTodoId());
});

it('keeps, replaces and removes a todo in memory', () => {
  const id = newTodoId();

  writeTodo({ id, title: 'Buy milk', completed: false });
  writeTodo({ id, title: 'Buy milk', completed: true });

  expect(readTodo(id)).toEqual({ id, title: 'Buy milk', completed: true });
  expect(readTodos()).toContainEqual({ id, title: 'Buy milk', completed: true });

  removeTodo(id);

  expect(readTodo(id)).toBeUndefined();
  expect(readTodos().map((todo) => todo.id)).not.toContain(id);
});
