import { addTodo, deleteTodo, listTodos, toggleTodo } from './application.ts';

it('adds a todo that is not completed and lists it', () => {
  const todo = addTodo({ title: 'Buy milk' });

  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(listTodos()).toContainEqual(todo);
});

it('lists todos in the order they were added', () => {
  const first = addTodo({ title: 'First' });
  const second = addTodo({ title: 'Second' });

  const ids = listTodos().map((todo) => todo.id);
  expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
});

it('toggles a todo complete and keeps the change', () => {
  const todo = addTodo({ title: 'Walk the dog' });

  expect(toggleTodo({ id: todo.id })).toEqual({ ...todo, completed: true });
  expect(listTodos()).toContainEqual({ ...todo, completed: true });
});

it('deletes a todo', () => {
  const todo = addTodo({ title: 'Water the plants' });

  expect(deleteTodo({ id: todo.id })).toBe(true);
  expect(listTodos()).not.toContainEqual(todo);
});

it('finds no todo to toggle or delete for an unknown id', () => {
  expect(toggleTodo({ id: 'unknown' })).toBeUndefined();
  expect(deleteTodo({ id: 'unknown' })).toBe(false);
});
