import { create, list, remove, toggle } from './application.ts';

it('keeps independent todos intact when one changes', () => {
  const kept = create('Keep');
  const changed = create('Change');
  expect(toggle(changed.id)).toEqual({ ...changed, completed: true });
  remove(changed.id);
  expect(list()).toContainEqual(kept);
  expect(list()).not.toContainEqual(changed);
  remove(kept.id);
});

it('refuses blank titles before storing anything', () => {
  const before = list();
  expect(() => create('  ')).toThrow('Enter a title');
  expect(list()).toEqual(before);
});
