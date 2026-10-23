import { addTodo, deleteTodo, listTodos, toggleTodo } from './application.ts';

it('adds a todo that is not completed and lists it', () => {
  const todo = addTodo({ title: 'Buy milk' });

  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(listTodos()).toContainEqual(todo);
});

it('toggles a todo complete and back', () => {
  const { id } = addTodo({ title: 'Walk the dog' });

  expect(toggleTodo({ id })).toMatchObject({ id, completed: true });
  expect(toggleTodo({ id })).toMatchObject({ id, completed: false });
  expect(listTodos()).toContainEqual({ id, title: 'Walk the dog', completed: false });
});

it('deletes a todo so it is no longer listed', () => {
  const todo = addTodo({ title: 'Water the plants' });

  expect(deleteTodo({ id: todo.id })).toEqual(todo);
  expect(listTodos()).not.toContainEqual(todo);
});

it('finds no todo to toggle or delete for an unknown id', () => {
  expect(toggleTodo({ id: 'unknown' })).toBeUndefined();
  expect(deleteTodo({ id: 'unknown' })).toBeUndefined();
});
