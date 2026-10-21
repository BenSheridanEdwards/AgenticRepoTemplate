import { createTodo, listTodos, removeTodo, toggleTodo } from './application.ts';

it('creates a todo and lists it', () => {
  const todo = createTodo({ title: 'Walk the dog' });

  expect(todo).toMatchObject({ title: 'Walk the dog', completed: false });
  expect(listTodos()).toContainEqual(todo);
});

it('toggles a todo complete and back by id', () => {
  const todo = createTodo({ title: 'Water the plants' });
  const completed = (item: { id: string }) =>
    listTodos().find((listed) => listed.id === item.id)?.completed;

  toggleTodo({ id: todo.id });
  expect(completed(todo)).toBe(true);

  toggleTodo({ id: todo.id });
  expect(completed(todo)).toBe(false);
});

it('leaves the list unchanged when toggling an unknown id', () => {
  const before = listTodos().length;

  expect(() => toggleTodo({ id: 'missing' })).not.toThrow();
  expect(listTodos()).toHaveLength(before);
});

it('removes a todo by id and ignores an unknown id', () => {
  const todo = createTodo({ title: 'Read a book' });

  removeTodo({ id: todo.id });
  expect(listTodos().some((listed) => listed.id === todo.id)).toBe(false);

  expect(() => removeTodo({ id: 'missing' })).not.toThrow();
});
