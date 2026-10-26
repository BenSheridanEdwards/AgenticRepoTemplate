/** @jest-environment node */
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTask, TODO_TASK, validateTask, withinPaths } from './task.mjs';

describe('task boundary', () => {
  it('loads the Notes brief with the Todo gates and a scaffold-relative prompt', () => {
    const loaded = loadTask(join(import.meta.dirname, 'tasks/notes.json'));
    expect(validateTask(loaded.task)).toEqual({
      ...TODO_TASK,
      name: 'notes',
      prompt: 'tooling/trial/notes-prompt.md',
    });
    expect(loaded.promptFile).toBeUndefined();
  });
  it.each([
    'directory',
    'file',
  ])('keeps a built-in brief scaffold-pinned through a symlinked task %s', (kind) => {
    const folder = mkdtempSync(join(tmpdir(), 'task-alias-'));
    try {
      const alias = join(folder, 'tasks');
      symlinkSync(join(import.meta.dirname, 'tasks'), alias, 'dir');
      const taskAlias = join(folder, 'notes.json');
      symlinkSync(join(import.meta.dirname, 'tasks/notes.json'), taskAlias);
      expect(loadTask(kind === 'file' ? taskAlias : join(alias, 'notes.json'))).toMatchObject({
        taskDir: kind === 'file' ? folder : alias,
        promptFile: undefined,
      });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
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
