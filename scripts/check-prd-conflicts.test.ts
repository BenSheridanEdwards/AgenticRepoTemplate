import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeFilesystem, findPrdConflicts } from './check-prd-conflicts.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const SPEC = 'apps/web/e2e/greeting.spec.ts';
const SPEC_TEXT = [
  "test.describe('Greeting', () => {",
  "  test('greets a name through the api', async ({ page }) => {});",
  '  test("says so when the api fails", async ({ page }) => {});',
  "  test('keeps the visitor\\'s name', async ({ page }) => {});",
  "  test.skip('greets twice', async ({ page }) => {});",
  '});',
].join('\n');

/** An in-memory filesystem: `files` maps a repository-relative path to its content. */
function filesystemOf(files: Record<string, string>) {
  return {
    listTrackedFiles: () => Object.keys(files),
    readText: (path: string) => {
      if (!Object.hasOwn(files, path)) {
        throw new Error(`ENOENT: ${path}`);
      }
      return files[path];
    },
  };
}

function prd(...behaviours: string[]) {
  return ['# Greeting', '', '## Intent', '', 'Greets a visitor.', '', '## Behaviours', '']
    .concat(behaviours)
    .concat(['', '## Out of scope', '', '- Proved by [ignored](../../nowhere.spec.ts)'])
    .join('\n');
}

const proof = (title: string, target = '../../apps/web/e2e/greeting.spec.ts') =>
  `  - Proved by [${title}](${target})`;

function conflictsOf(prdText: string, extraFiles: Record<string, string> = {}) {
  return findPrdConflicts(
    filesystemOf({ 'docs/prd/greeting.md': prdText, [SPEC]: SPEC_TEXT, ...extraFiles }),
  );
}

describe('findPrdConflicts', () => {
  it('passes on the PRDs in this repository', () => {
    const filesystem = createNodeFilesystem(REPOSITORY_ROOT);
    expect(filesystem.listTrackedFiles()).toContain('docs/prd/greeting.md');
    expect(findPrdConflicts(filesystem)).toEqual([]);
  });

  it('passes when every behaviour names a test that exists in its spec', () => {
    const text = prd(
      '- **Greets the visitor.** The page shows the greeting.',
      '  The spaces around the name are trimmed.',
      proof('greets a name through the api'),
      '- **Reports a failure.** The page says the greeting could not load.',
      proof('says so when the api fails'),
      proof("keeps the visitor's name"),
    );
    expect(conflictsOf(text)).toEqual([]);
  });

  it('fails, naming the line, when a behaviour names no test', () => {
    const text = prd(
      '- **Greets the visitor.** The page shows the greeting.',
      proof('greets a name through the api'),
      '- **Remembers the name.** The page keeps the last name.',
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/greeting\.md:11 .*Remembers the name.*Proved by/),
    ]);
  });

  it('fails when a linked spec file does not exist', () => {
    const text = prd(
      '- **Greets the visitor.** The page shows the greeting.',
      proof('greets a name through the api', '../../apps/web/e2e/gone.spec.ts'),
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/greeting\.md:10 .*`apps\/web\/e2e\/gone\.spec\.ts`/),
    ]);
  });

  it('fails when a linked file exists but is not an E2E spec', () => {
    const unitTest = 'apps/web/src/routes/greeting/GreetingPage.test.tsx';
    const text = prd(
      '- **Greets the visitor.** The page shows the greeting.',
      proof('greets a name through the api', `../../${unitTest}`),
    );
    expect(conflictsOf(text, { [unitTest]: SPEC_TEXT })).toEqual([
      expect.stringContaining(`\`${unitTest}\``),
    ]);
  });

  it('fails when the linked spec has no test with that title', () => {
    const text = prd(
      '- **Greets the visitor.** The page shows the greeting.',
      proof('greets a name through the API'),
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/greeting\.md:10 .*"greets a name through the API"/),
    ]);
  });

  it('fails when the linked test is skipped, since a skipped test proves nothing', () => {
    const text = prd('- **Greets twice.** The page greets again.', proof('greets twice'));
    expect(conflictsOf(text)).toEqual([expect.stringContaining('"greets twice"')]);
  });

  it('fails when a PRD lists no behaviours', () => {
    const text = '# Greeting\n\n## Intent\n\nGreets a visitor.\n';
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/greeting\.md .*Behaviours/),
    ]);
  });

  it('counts only the list items under the Behaviours heading', () => {
    const text = [
      '- **Greets the visitor.** The page shows the greeting.',
      proof('greets a name through the api'),
      '',
      '## Intent',
      '',
      'Greets a visitor.',
    ].join('\n');
    expect(conflictsOf(text)).toEqual([expect.stringContaining('lists no behaviours')]);
  });

  it('checks only the Markdown files directly in docs/prd/', () => {
    const files = {
      'docs/prd/archive/old.md': prd('- **Old.** Gone.'),
      'docs/notes.md': prd('- x'),
    };
    expect(
      conflictsOf(prd('- **Greets.** Hi.', proof('greets a name through the api')), files),
    ).toEqual([]);
  });
});
