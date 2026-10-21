/** @jest-environment node */
import { TODO_TASK, validateTask, withinPaths } from './task.mjs';

describe('task boundary', () => {
  it('accepts the committed Todo task unchanged', () => {
    expect(validateTask(TODO_TASK)).toBe(TODO_TASK);
  });
  it.each([
    'name',
    'prompt',
    'allowedPaths',
    'setup',
    'checks',
    'land',
  ])('names a missing %s', (field) => {
    const value = { ...TODO_TASK };
    delete value[field];
    expect(() => validateTask(value)).toThrow(`task.${field}`);
  });
  it.each([
    ['typo', { typo: true }],
    ['target.rev', { target: { repo: '/target', rev: 'HEAD' } }],
    ['allowedPaths', { allowedPaths: ['../outside'] }],
    ['evidenceDir', { evidenceDir: 'relative' }],
    ['checks', { checks: [{ name: 'x', argv: ['true'], typo: 1 }] }],
    [
      'checks',
      { checks: [{ name: 'x', argv: ['true'] }], acceptance: [{ name: 'x', argv: ['true'] }] },
    ],
  ])('names an invalid %s', (field, update) => {
    expect(() => validateTask({ ...TODO_TASK, ...update })).toThrow(`task.${field}`);
  });
  it('matches file and folder boundaries rather than similarly named siblings', () => {
    expect(withinPaths('src/a', ['src/'])).toBe(true);
    expect(withinPaths('src-other/a', ['src/'])).toBe(false);
    expect(withinPaths('lock.json', ['lock.json'])).toBe(true);
    expect(withinPaths('lock.json.bak', ['lock.json'])).toBe(false);
  });
});
