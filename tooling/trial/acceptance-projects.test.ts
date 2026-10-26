/** @jest-environment node */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

it('runs only the acceptance spec belonging to each result brief', () => {
  const root = mkdtempSync(join(tmpdir(), 'acceptance-projects-'));
  const repository = resolve(import.meta.dirname, '../..');
  const ids = ['todo-01', 'todo-codex-02', 'notes-01', 'notes-codex-02', 'x', 'demo-01'];
  const env = { ...process.env };
  delete env.JEST_WORKER_ID;
  try {
    mkdirSync(join(root, 'tooling'));
    cpSync(join(repository, 'playwright.config.ts'), join(root, 'playwright.config.ts'));
    cpSync(join(repository, 'tooling/results.mjs'), join(root, 'tooling/results.mjs'));
    symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    ids
      .flatMap((id) => ['web', 'api'].map((pkg) => join(root, 'showcase', id, pkg)))
      .forEach((path) => {
        mkdirSync(path, { recursive: true });
        writeFileSync(join(path, 'package.json'), '{}');
      });
    const projects = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import config from './playwright.config.ts'; console.log(JSON.stringify(config.projects));",
        ],
        { cwd: root, env, encoding: 'utf8' },
      ),
    );
    expect(projects.filter(({ name }: { name: string }) => name.endsWith('-acceptance'))).toEqual(
      expect.arrayContaining(
        ids.map((id) =>
          expect.objectContaining({
            name: `${id}-acceptance`,
            testMatch: id.startsWith('notes') ? 'notes.spec.ts' : 'todo.spec.ts',
          }),
        ),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
