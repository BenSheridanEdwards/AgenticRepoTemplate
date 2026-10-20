import { createTodo, deleteTodo, listTodos, toggleCompleted } from './application.ts';

it('creates, lists, toggles and deletes a todo in memory', () => {
  const todo = createTodo({ title: 'Read' });
  expect(todo).toEqual({ id: expect.any(String), title: 'Read', completed: false });
  expect(listTodos()).toContainEqual(todo);
  expect(toggleCompleted(todo)).toEqual({ ...todo, completed: true });
  expect(toggleCompleted(todo)).toEqual(todo);
  deleteTodo(todo);
  expect(listTodos()).not.toContainEqual(todo);
  expect(() => toggleCompleted(todo)).toThrow('Todo not found');
  expect(() => deleteTodo(todo)).not.toThrow();
});
