import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
  "  test.fixme('greets in French', async ({ page }) => {});",
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

  it('fails, naming the line, when the linked test is marked fixme', () => {
    const text = prd('- **Greets in French.** Bonjour.', proof('greets in French'));
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/greeting\.md:10 .*"greets in French"/),
    ]);
  });

  it.each([
    ['a line comment', "// test('greets later', async () => {});"],
    ['a block comment', "/* test('greets later', async () => {}); */"],
    ['a block comment over several lines', "/*\n  test('greets later', async () => {});\n*/"],
    [
      'a describe.skip group',
      "test.describe.skip('Later', () => { test('greets later', async () => {}); });",
    ],
    [
      'a describe.fixme group',
      "test.describe.fixme('Later', () => { test('greets later', async () => {}); });",
    ],
    ['a test that skips itself', "test('greets later', async () => { test.skip(); });"],
    [
      'a test that skips itself on a condition',
      "test('greets later', async ({ browserName }) => { test.skip(browserName === 'webkit', 'flaky'); });",
    ],
    [
      'a group whose hook skips it',
      "test.describe('Later', () => { test.beforeEach(() => { test.fixme(); }); test('greets later', async () => {}); });",
    ],
    [
      'a file that skips every test',
      "test.skip(true, 'not yet');\ntest('greets later', async () => {});",
    ],
    [
      'a file that skips every test on a callback condition',
      "test.skip(({ browserName }) => browserName === 'webkit', 'flaky');\ntest('greets later', async () => {});",
    ],
    ['a test marked to fail', "test('greets later', async () => { test.fail(); });"],
    [
      'a group marked to fail on a condition',
      "test.describe('Later', () => { test.fail(true, 'known bug'); test('greets later', async () => {}); });",
    ],
    ['a test.fail test', "test.fail('greets later', async () => {});"],
    [
      'a test that testInfo skips',
      "test('greets later', async ({}, testInfo) => { testInfo.skip(); });",
    ],
    [
      'a test that testInfo marks to fail',
      "test('greets later', async ({}, testInfo) => { testInfo.fail(); });",
    ],
    [
      'a test that a renamed testInfo marks fixme on a condition',
      "test('greets later', async ({}, info) => { info.fixme(true, 'not yet'); });",
    ],
    [
      'a group that describe.skip skips through an alias',
      "const { describe } = test;\ndescribe.skip('Later', () => { test('greets later', async () => {}); });",
    ],
    ['a regular expression test call', "/greets/.test('greets later');"],
    ['a describe title', "test.describe('greets later', () => {});"],
  ])('fails when the linked title appears only in %s', (_, source) => {
    const text = prd('- **Greets later.** The page greets later.', proof('greets later'));
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([
      expect.stringContaining('has no test with that title'),
    ]);
  });

  it('fails when the linked title is a template literal with a substitution', () => {
    const title = `greets \${name}`;
    const text = prd('- **Greets later.** The page greets later.', proof(title));
    expect(conflictsOf(text, { [SPEC]: `test(\`${title}\`, async () => {});` })).toEqual([
      expect.stringContaining('has no test with that title'),
    ]);
  });

  it('counts a test beside a skipped one, a focused test and a template literal title', () => {
    const source = [
      "test.describe('Greeting', () => {",
      "  test('greets later', async () => { test.skip(); });",
      "  test('greets now', async () => {});",
      "  test.only('greets first', async () => {});",
      `  test(\`greets \${'in'} time\`, async () => {});`,
      '  test(`greets plainly`, async () => {});',
      '});',
    ].join('\n');
    const text = prd(
      '- **Greets.** The page greets.',
      proof('greets now'),
      proof('greets first'),
      proof('greets plainly'),
    );
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([]);
  });

  it('counts a test beside a skipped test whose title is computed', () => {
    const source = [
      "const name = 'greets slowly';",
      `test.skip(\`greets \${'in'} time\`, async () => {});`,
      "test.fixme(name, { tag: '@slow' }, async () => {});",
      "test('greets later', async () => {});",
    ].join('\n');
    const text = prd('- **Greets later.** The page greets later.', proof('greets later'));
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([]);
  });

  it.each([
    ['a tab', '\t'],
    ['four spaces', '    '],
    ['three spaces', '   '],
  ])('reads a proof indented by %s', (_, indent) => {
    const text = prd(
      '- **Greets the visitor.** The page shows the greeting.',
      `${indent}- Proved by [greets a name through the api](../../apps/web/e2e/greeting.spec.ts)`,
    );
    expect(conflictsOf(text)).toEqual([]);
  });

  it('reads a proof whose spec link has a line anchor', () => {
    const text = prd(
      '- **Greets the visitor.** The page shows the greeting.',
      proof('greets a name through the api', '../../apps/web/e2e/greeting.spec.ts#L12'),
    );
    expect(conflictsOf(text)).toEqual([]);
  });

  it.each([
    ['a numbered behaviour', '1. **Greets twice.** Again.'],
    ['a plus-marked behaviour', '+ **Greets twice.** Again.'],
    ['a behaviour indented by one space', ' - **Greets twice.** Again.'],
    [
      'a proof indented by one space',
      ' - Proved by [greets twice](../../apps/web/e2e/greeting.spec.ts)',
    ],
    [
      'a proof link with a title',
      '  - Proved by [greets twice](../../apps/web/e2e/greeting.spec.ts "title")',
    ],
    [
      'a proof link in angle brackets',
      '  - Proved by [greets twice](<../../apps/web/e2e/greeting.spec.ts>)',
    ],
    [
      'a proof with no list marker',
      '  Proved by [greets twice](../../apps/web/e2e/greeting.spec.ts)',
    ],
  ])('fails, naming the line, on %s the check cannot read', (_, line) => {
    const text = prd(
      '- **Greets the visitor.** The page shows the greeting.',
      proof('greets a name through the api'),
      line,
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/greeting\.md:11 .*cannot read/),
    ]);
  });

  it('names the unread lines of a PRD whose behaviours it cannot read at all', () => {
    const text = prd('1. **Greets.** Hi.', proof('greets a name through the api'));
    expect(conflictsOf(text)).toEqual([
      expect.stringContaining('lists no behaviours'),
      expect.stringMatching(/^docs\/prd\/greeting\.md:9 .*cannot read/),
      expect.stringMatching(/^docs\/prd\/greeting\.md:10 .*cannot read/),
    ]);
  });

  it('fails on a proof that comes before any behaviour', () => {
    const text = prd(
      proof('greets a name through the api'),
      '- **Greets the visitor.** The page shows the greeting.',
      proof('greets a name through the api'),
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/greeting\.md:9 .*cannot read/),
    ]);
  });

  it('fails when a PRD has a second Behaviours section', () => {
    const text = prd(
      '- **Greets the visitor.** The page shows the greeting.',
      proof('greets a name through the api'),
      '',
      '## Behaviours',
      '',
      '- **Greets twice.** Again.',
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/greeting\.md:12 .*second `## Behaviours`/),
    ]);
  });

  it('checks every PRD and reports the one that conflicts', () => {
    const second = prd('- **Greets twice.** Again.', proof('greets twice'));
    expect(
      conflictsOf(prd('- **Greets.** Hi.', proof('greets a name through the api')), {
        'docs/prd/repeat.md': second,
      }),
    ).toEqual([expect.stringMatching(/^docs\/prd\/repeat\.md:10 .*"greets twice"/)]);
  });

  it('treats every tracked Markdown file directly in docs/prd/ as a PRD, a README included', () => {
    const conflicts = conflictsOf(
      prd('- **Greets.** Hi.', proof('greets a name through the api')),
      {
        'docs/prd/README.md': '# PRDs\n\n- [Greeting](greeting.md)\n',
      },
    );
    expect(conflicts).toEqual([
      expect.stringMatching(/^docs\/prd\/README\.md lists no behaviours/),
    ]);
  });
});

describe('createNodeFilesystem', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'prd-check-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function track(files: Record<string, string>) {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
  }

  it('reports a tracked spec deleted from the working tree as missing, not a crash', () => {
    track({
      'docs/prd/greeting.md': prd('- **Greets.** Hi.', proof('greets a name through the api')),
      [SPEC]: SPEC_TEXT,
    });
    rmSync(join(root, SPEC));
    expect(findPrdConflicts(createNodeFilesystem(root))).toEqual([
      expect.stringContaining('is not a tracked E2E spec'),
    ]);
  });
});
