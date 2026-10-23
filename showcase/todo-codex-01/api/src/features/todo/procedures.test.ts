import { appRouter } from '../../router.ts';
import { createCallerFactory } from '../../trpc.ts';
import { createTodo, toggleTodo } from './domain.ts';

const caller = createCallerFactory(appRouter)({});
it('validates domain titles and toggles without changing identity', () => {
  expect(() => createTodo('id', '  ')).toThrow('Enter a title');
  const todo = createTodo('id', ' Task ');
  expect(todo).toEqual({ id: 'id', title: 'Task', completed: false });
  expect(toggleTodo(todo)).toEqual({ ...todo, completed: true });
});
it('creates, lists, toggles twice and deletes in process memory', async () => {
  const todo = await caller.todo.create({ title: ' Task ' });
  expect(await caller.todo.list()).toContainEqual(todo);
  expect(await caller.todo.toggle({ id: todo.id })).toEqual({ ...todo, completed: true });
  expect(await caller.todo.toggle({ id: todo.id })).toEqual(todo);
  await caller.todo.delete({ id: todo.id });
  expect(await caller.todo.list()).not.toContainEqual(todo);
  expect(await caller.todo.toggle({ id: todo.id })).toBeUndefined();
  await caller.todo.delete({ id: todo.id });
});
it.each(['', '   '])('rejects blank titles %j', async (title) => {
  await expect(caller.todo.create({ title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
