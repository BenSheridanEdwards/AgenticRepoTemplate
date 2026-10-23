import { findTodo, newTodoId, readTodos, removeTodo, saveTodo } from './integrations.ts';

it('gives each todo its own id', () => {
  expect(newTodoId()).not.toBe(newTodoId());
});

it('saves, replaces, reads and removes todos in creation order', () => {
  const first = { id: 'store-1', title: 'First', completed: false };
  const second = { id: 'store-2', title: 'Second', completed: false };
  saveTodo(first);
  saveTodo(second);
  saveTodo({ ...first, completed: true });

  expect(findTodo('store-1')).toEqual({ ...first, completed: true });
  expect(readTodos()).toEqual([{ ...first, completed: true }, second]);

  expect(removeTodo('store-1')).toEqual({ ...first, completed: true });
  expect(removeTodo('store-1')).toBeUndefined();
  expect(findTodo('store-1')).toBeUndefined();
  expect(readTodos()).toEqual([second]);
});
