import { appRouter } from '../../router.ts';
import { createCallerFactory } from '../../trpc.ts';
import { normalizeTitle } from './domain.ts';

const caller = createCallerFactory(appRouter)({});
it('creates, lists, toggles twice and deletes a todo', async () => {
  const todo = await caller.todos.create({ title: '  Buy milk  ' });
  expect(todo).toEqual({ id: expect.any(String), title: 'Buy milk', completed: false });
  expect(await caller.todos.list()).toContainEqual(todo);
  expect(await caller.todos.toggle({ id: todo.id })).toEqual({ ...todo, completed: true });
  expect(await caller.todos.toggle({ id: todo.id })).toEqual(todo);
  await caller.todos.delete({ id: todo.id });
  expect(await caller.todos.list()).not.toContainEqual(todo);
  expect(await caller.todos.toggle({ id: todo.id })).toBeNull();
});
it.each(['', '   '])('rejects a blank title %j', async (title) => {
  await expect(caller.todos.create({ title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(() => normalizeTitle(title)).toThrow('Enter a title');
});
