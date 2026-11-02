beforeEach(() => jest.resetModules());

it('starts empty and lists recorded names newest first', async () => {
  const { recordGreeting, listRecentGreetings } = await import('./application.ts');
  expect(listRecentGreetings()).toEqual({ names: [] });
  recordGreeting({ name: 'Ada' });
  recordGreeting({ name: 'Lin' });
  expect(listRecentGreetings()).toEqual({ names: ['Lin', 'Ada'] });
});

it('keeps previous snapshots unchanged when another name is recorded', async () => {
  const { recordGreeting, listRecentGreetings } = await import('./application.ts');
  recordGreeting({ name: 'Ada' });
  const previous = listRecentGreetings();
  recordGreeting({ name: 'Lin' });
  expect(previous).toEqual({ names: ['Ada'] });
});
