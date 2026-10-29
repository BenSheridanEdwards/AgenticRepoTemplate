import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APPROVER,
  approvalLabel,
  COMMENT_MARKER,
  enforcementProblems,
  GATE_AUTHOR,
  GUARDS,
  guardedPaths,
  LIST_FILES_LIMIT,
  londonTime,
  planApproval,
  run,
  STATUS_CONTEXT,
  signoffComment,
} from './enforcement-approval.mjs';

const HEAD = 'a'.repeat(40);
const NEXT = 'b'.repeat(40);
const MERGE_BASE = 'c'.repeat(40);

interface Problem {
  path: string;
  area: string;
  reason: string;
}

interface Editor {
  login: string;
  type: string;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const json = (value: JsonValue) => JSON.stringify(value, null, 2);

function reasons(path: string, before: string | null, after: string | null): string[] {
  return enforcementProblems([{ path, before, after }]).map((problem: Problem) => problem.reason);
}

function edited<T>(base: T, change: (draft: T) => T): T {
  const draft: T = JSON.parse(JSON.stringify(base));
  return change(draft);
}

const tick = (body: string, box = 'x') =>
  body.replace('\n- [ ] Approve these', `\n- [${box}] Approve these`);

const PROBLEMS: Problem[] = [
  { path: 'biome.json', area: 'Biome config', reason: 'sets `linter.enabled` to `false`' },
];

const ben: Editor = { login: APPROVER, type: 'User' };

describe('GUARDS', () => {
  it('checks the guarded areas in a fixed order, first match wins', () => {
    expect(GUARDS.map((guard: { area: string }) => guard.area)).toEqual([
      'Enforcement-approval gate',
      'Vendored lint rules',
      'Oxlint config',
      'CI workflows',
      'Git hooks',
      'Lint config',
      'Biome config',
      'Product intent',
    ]);
  });

  it.each([
    ['.github/workflows/enforcement-approval.yml', 'Enforcement-approval gate'],
    ['scripts/enforcement-approval.mjs', 'Enforcement-approval gate'],
    ['scripts/enforcement-approval.test.ts', 'Enforcement-approval gate'],
    ['.oxlintrc.json', 'Oxlint config'],
    ['apps/web/.oxlintrc.json', 'Oxlint config'],
    ['vendor/anti-slop/index.ts', 'Vendored lint rules'],
    ['oxlint.config.ts', 'Vendored lint rules'],
    ['apps/web/oxlint.config.json', 'Vendored lint rules'],
    ['.github/workflows/ci.yml', 'CI workflows'],
    ['.husky/pre-commit', 'Git hooks'],
    ['eslint.config.js', 'Lint config'],
    ['commitlint.config.ts', 'Lint config'],
    ['tooling/eslint-plugin-policy.js', 'Lint config'],
    ['scripts/check-suppressions.mjs', 'Lint config'],
    ['biome.json', 'Biome config'],
    ['docs/prd/greeting.md', 'Product intent'],
    ['docs/prd/nested/feature.md', 'Product intent'],
    ['docs/NORTH_STAR.md', 'Product intent'],
  ])('guards %s as %s', (path, area) => {
    expect(guardedPaths([{ filename: path }])).toEqual([path]);
    expect(enforcementProblems([{ path, before: '{}', after: null }])[0]?.area).toBe(area);
  });

  it.each([
    'src/App.tsx',
    'AGENTS.md',
    '.agents/x.md',
    '.agents/START_HERE.md',
    'docs/NORTH_STAR.md.bak',
    'docs/prd-other/feature.md',
    'package.json',
    'pnpm-lock.yaml',
    'CLAUDE.md',
    '.github/pull_request_template.md',
    '.claude/settings.json',
    '.claude/hooks/block-gate-bypass.sh',
    '.claude/skills/show-me/SKILL.md',
    'scripts/required-gates.mjs',
    'docs/required-gates.md',
    'tooling/anything.json',
    'tooling/anti-slop/advisory.json',
    'vendor/anti-slop-other/index.ts',
    '.oxlintrc.json.bak',
    'oxlint.config.ts/unrelated.ts',
    'apps/web/eslint.config.mts',
    'apps/web/biome.jsonc',
    '.fallowrc.jsonc',
    'tsconfig.json',
    'jest.config.ts',
    '.gitignore',
  ])('leaves %s unguarded', (path) => {
    expect(guardedPaths([{ filename: path }])).toEqual([]);
    expect(enforcementProblems([{ path, before: 'a', after: null }])).toEqual([]);
  });
});

describe('guardedPaths', () => {
  it('lists both sides of a rename once each, sorted', () => {
    expect(
      guardedPaths([
        { filename: 'docs/moved.yml', previous_filename: '.github/workflows/moved.yml' },
        { filename: 'biome.json' },
        { filename: 'biome.json' },
        { filename: '.husky/pre-push', previous_filename: '.husky/pre-commit' },
      ]),
    ).toEqual([
      '.github/workflows/moved.yml',
      '.husky/pre-commit',
      '.husky/pre-push',
      'biome.json',
    ]);
  });

  it('reads a file renamed out of a guarded path as deleted', () => {
    const [path = ''] = guardedPaths([
      { filename: 'docs/moved.yml', previous_filename: '.github/workflows/moved.yml' },
    ]);

    expect(reasons(path, 'on: push', null)).toEqual(['deletes the file']);
  });
});

describe('rewrite judge', () => {
  it.each([
    [null, 'npx lint-staged', 'adds enforcement code'],
    ['npx lint-staged', 'true', 'edits enforcement code'],
    ['npx lint-staged', null, 'deletes the file'],
  ])('reads %p → %p as "%s"', (before, after, reason) => {
    expect(reasons('.husky/pre-commit', before, after)).toEqual([reason]);
  });

  it.each([
    '.github/workflows/enforcement-approval.yml',
    'scripts/enforcement-approval.mjs',
    'scripts/enforcement-approval.test.ts',
  ])('names an edit to the gate itself in %s', (path) => {
    expect(reasons(path, 'a', 'b')).toEqual(['edits the enforcement-approval gate']);
  });
});

describe('anti-slop enforcement', () => {
  it.each([
    'vendor/anti-slop/rules/no-module-mocking.ts',
    'vendor/anti-slop/.oxlintrc.json',
    'oxlint.config.ts',
    'apps/web/oxlint.config.mjs',
    'oxlint.config.json',
  ])('requires sign-off for every addition, edit and deletion of %s', (path) => {
    expect(reasons(path, null, '{}')).toEqual(['adds enforcement code']);
    expect(reasons(path, '{}', '{"$schema":"new"}')).toEqual(['edits enforcement code']);
    expect(reasons(path, '{}', null)).toEqual(['deletes the file']);
  });

  it.each([
    '.oxlintrc.json',
    'apps/web/.oxlintrc.json',
  ])('judges JSON loosening and tightening in %s', (path) => {
    const rule = (level: string) => ({ rules: { 'anti-slop/no-module-mocking': level } });
    expect(reasons(path, json(rule('warn')), json(rule('error')))).toEqual([]);
    expect(reasons(path, '{}', json(rule('error')))).toEqual([]);
    expect(reasons(path, json(rule('error')), json(rule('warn')))).toEqual([
      'lowers `rules.anti-slop/no-module-mocking` from `error` to `warn`',
    ]);
    expect(reasons(path, json(rule('error')), json(rule('off')))).toEqual([
      'lowers `rules.anti-slop/no-module-mocking` from `error` to `off`',
    ]);
    expect(reasons(path, json(rule('error')), '{}')).toEqual([
      'removes rule `rules.anti-slop/no-module-mocking`',
    ]);
    expect(reasons(path, '{}', json({ ignorePatterns: ['src/**'] }))).toEqual([
      'adds `src/**` to `ignorePatterns`',
    ]);
    expect(reasons(path, json({ jsPlugins: ['anti-slop'] }), json({ jsPlugins: [] }))).toEqual([
      'removes `anti-slop` from `jsPlugins`',
    ]);
    expect(reasons(path, json({ plugins: ['react'] }), json({ plugins: [] }))).toEqual([
      'removes `react` from `plugins`',
    ]);
    expect(
      reasons(
        path,
        json({ overrides: [{ files: ['src/**'] }] }),
        json({ overrides: [{ files: ['src/safe/**'] }] }),
      ),
    ).toEqual(['changes the files an override covers']);
    expect(reasons(path, '{"$schema":"old"}', '{"$schema":"new"}')).toEqual([]);
    expect(reasons(path, '{}', 'invalid json')).toEqual([
      'is not valid JSON, so the gate cannot rank the change',
    ]);
    expect(reasons(path, '{}', null)).toEqual(['deletes the file']);
  });
});

describe('product intent', () => {
  it.each([
    'docs/prd/greeting.md',
    'docs/NORTH_STAR.md',
  ])('requires sign-off for every addition, edit and deletion of %s', (path) => {
    [
      [null, 'intent'],
      ['intent', 'updated intent'],
      ['intent', null],
    ].forEach(([before, after]) => {
      expect(enforcementProblems([{ path, before, after }])).toEqual([
        expect.objectContaining({ path, area: 'Product intent' }),
      ]);
    });

    expect(reasons(path, 'intent', 'updated intent')).toEqual(['edits product intent']);
  });

  it.each([
    ['docs/prd/greeting.md', 'docs/greeting.md', ['docs/prd/greeting.md']],
    ['docs/greeting.md', 'docs/prd/greeting.md', ['docs/prd/greeting.md']],
    [
      'docs/prd/greeting.md',
      'docs/prd/renamed.md',
      ['docs/prd/greeting.md', 'docs/prd/renamed.md'],
    ],
    ['docs/NORTH_STAR.md', '.agents/archived.md', ['docs/NORTH_STAR.md']],
    ['.agents/draft.md', 'docs/NORTH_STAR.md', ['docs/NORTH_STAR.md']],
  ])('requires sign-off for a rename from %s to %s', (previous, filename, expected) => {
    const paths = guardedPaths([{ filename, previous_filename: previous }]);
    expect(paths).toEqual(expected);

    const changes = paths.map((path: string) => ({
      path,
      before: path === previous ? 'intent' : null,
      after: path === filename ? 'intent' : null,
    }));

    expect(enforcementProblems(changes)).toEqual(
      paths.map((path: string) => expect.objectContaining({ path, area: 'Product intent' })),
    );
  });
});

describe('json judge', () => {
  const biome = {
    $schema: 'https://biomejs.dev/schemas/2.5.1/schema.json',
    formatter: { lineWidth: 100 },
    files: { includes: ['**', '!**/dist'] },
    linter: {
      enabled: true,
      rules: {
        style: { useConst: 'error', noNonNullAssertion: 'warn' },
        suspicious: { noDebugger: 'off' },
      },
    },
    overrides: [{ includes: ['src/**'], linter: { rules: { style: { useConst: 'error' } } } }],
  };

  type Biome = typeof biome & {
    linter: { rules: { style: Record<string, string>; suspicious: Record<string, string> } };
  };

  const biomeReasons = (change: (draft: Biome) => Biome) =>
    reasons('biome.json', json(biome), json(edited<Biome>(biome, change)));

  it.each<[string, (draft: Biome) => Biome, string[]]>([
    [
      'a lowered severity',
      (draft) => ({
        ...draft,
        linter: {
          ...draft.linter,
          rules: { ...draft.linter.rules, style: { ...draft.linter.rules.style, useConst: 'off' } },
        },
      }),
      ['lowers `linter.rules.style.useConst` from `error` to `off`'],
    ],
    [
      'a raised severity',
      (draft) => ({
        ...draft,
        linter: {
          ...draft.linter,
          rules: {
            ...draft.linter.rules,
            style: { ...draft.linter.rules.style, noNonNullAssertion: 'error' },
          },
        },
      }),
      [],
    ],
    [
      'a rule added at error',
      (draft) => ({
        ...draft,
        linter: {
          ...draft.linter,
          rules: {
            ...draft.linter.rules,
            style: { ...draft.linter.rules.style, useBlockStatements: 'error' },
          },
        },
      }),
      [],
    ],
    [
      'a rule added at off',
      (draft) => ({
        ...draft,
        linter: {
          ...draft.linter,
          rules: {
            ...draft.linter.rules,
            style: { ...draft.linter.rules.style, useBlockStatements: 'off' },
          },
        },
      }),
      ['adds rule `linter.rules.style.useBlockStatements` at `off`'],
    ],
    [
      'a removed off rule',
      (draft) => ({
        ...draft,
        linter: {
          ...draft.linter,
          rules: {
            ...draft.linter.rules,
            suspicious: Object.fromEntries(
              Object.entries(draft.linter.rules.suspicious).filter(([key]) => key !== 'noDebugger'),
            ),
          },
        },
      }),
      [],
    ],
    [
      'a removed error rule',
      (draft) => ({
        ...draft,
        linter: {
          ...draft.linter,
          rules: {
            ...draft.linter.rules,
            style: Object.fromEntries(
              Object.entries(draft.linter.rules.style).filter(([key]) => key !== 'useConst'),
            ),
          },
        },
      }),
      ['removes rule `linter.rules.style.useConst`'],
    ],
    [
      'an added negated include',
      (draft) => ({
        ...draft,
        files: { ...draft.files, includes: [...draft.files.includes, '!src/legacy/**'] },
      }),
      ['adds `!src/legacy/**` to `files.includes`'],
    ],
    [
      'a removed positive include',
      (draft) => ({ ...draft, files: { ...draft.files, includes: ['!**/dist'] } }),
      ['removes `**` from `files.includes`'],
    ],
    [
      'a removed negated include',
      (draft) => ({ ...draft, files: { ...draft.files, includes: ['**'] } }),
      [],
    ],
    [
      'a disabled linter',
      (draft) => ({ ...draft, linter: { ...draft.linter, enabled: false } }),
      ['sets `linter.enabled` to `false`'],
    ],
    [
      'a change to the files an override covers',
      (draft) => ({
        ...draft,
        overrides: draft.overrides.map((override, index) =>
          index === 0 ? { ...override, includes: [...override.includes, 'scripts/**'] } : override,
        ),
      }),
      ['changes the files an override covers'],
    ],
    [
      'a neutral formatter change',
      (draft) => ({ ...draft, formatter: { ...draft.formatter, lineWidth: 120 } }),
      [],
    ],
    [
      'a $schema change',
      (draft) => ({ ...draft, $schema: 'https://biomejs.dev/schemas/2.6.0/schema.json' }),
      [],
    ],
  ])('judges %s in biome.json', (_name, change, expected) => {
    expect(biomeReasons(change)).toEqual(expected);
  });

  it('parses JSONC with comments and trailing commas', () => {
    const before = `{
  // Biome reads comments in biome.json.
  "$schema": "https://biomejs.dev/schemas/2.5.1/schema.json", /* a URL keeps its // */
  "files": { "includes": ["**",], },
}
`;

    const after = before.replace('Biome reads comments in biome.json.', 'Reworded.');
    expect(reasons('biome.json', before, after)).toEqual([]);
  });

  it('refuses to rank a file that is not valid JSON', () => {
    expect(reasons('biome.json', json(biome), '{ "files": [')).toEqual([
      'is not valid JSON, so the gate cannot rank the change',
    ]);
  });

  it('reads a deleted config as deleted', () => {
    expect(reasons('biome.json', json(biome), null)).toEqual(['deletes the file']);
  });

  it('caps the reasons for one file at ten', () => {
    const rules = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`rule${index}`, 'off']),
    );

    const found = reasons('biome.json', '{}', json({ linter: { rules: { style: rules } } }));
    expect(found).toHaveLength(11);
    expect(found.at(-1)).toBe('and 2 more changes');
  });
});

describe('coverage lists created from nothing', () => {
  it('flags a new Biome linter.includes, which narrows linting from every file', () => {
    expect(
      reasons(
        'biome.json',
        '{"linter":{"enabled":true}}',
        '{"linter":{"enabled":true,"includes":["src/App.tsx"]}}',
      ),
    ).toEqual(['starts `linter.includes`, which limits the files it covers']);
  });

  it('asks when Biome import sorting is turned off', () => {
    expect(
      reasons(
        'biome.json',
        '{"assist":{"actions":{"source":{"organizeImports":"on"}}}}',
        '{"assist":{"actions":{"source":{"organizeImports":"off"}}}}',
      ),
    ).toEqual(['changes `assist.actions.source.organizeImports`']);
  });
});

describe('Biome flags that turn checking off', () => {
  it.each([
    ['{"linter":{"enabled":null}}', 'removes `linter.enabled`'],
    [
      '{"linter":{"enabled":true},"vcs":{"useIgnoreFile":true}}',
      'sets `vcs.useIgnoreFile` to `true`',
    ],
  ])('flags %s', (after, reason) => {
    expect(reasons('biome.json', '{"linter":{"enabled":true}}', after)).toEqual([reason]);
  });
});

describe('enforcementProblems', () => {
  it('orders problems by path and ignores unguarded changes', () => {
    expect(
      enforcementProblems([
        { path: 'biome.json', before: '{"linter":{"enabled":true}}', after: '{}' },
        { path: 'src/App.tsx', before: 'a', after: 'b' },
        { path: '.husky/pre-commit', before: 'a', after: 'b' },
      ]),
    ).toEqual([
      { path: '.husky/pre-commit', area: 'Git hooks', reason: 'edits enforcement code' },
      { path: 'biome.json', area: 'Biome config', reason: 'removes `linter.enabled`' },
    ]);
  });
});

describe('londonTime', () => {
  it.each([
    ['a BST afternoon on the hour', '2026-10-12T14:00:00Z', 'Monday, the 12th of October, at 3 pm'],
    [
      'a GMT afternoon with minutes',
      '2026-01-08T15:05:00Z',
      'Thursday, the 8th of January, at 3:05 pm',
    ],
    ['midnight in GMT', '2026-12-01T00:00:00Z', 'Tuesday, the 1st of December, at 12 am'],
    ['noon in BST', '2026-07-02T11:00:00Z', 'Thursday, the 2nd of July, at 12 pm'],
    [
      'the last GMT half hour before the clocks go forward',
      '2026-03-29T00:30:00Z',
      'Sunday, the 29th of March, at 12:30 am',
    ],
    [
      'the first BST half hour after the clocks go forward',
      '2026-03-29T01:30:00Z',
      'Sunday, the 29th of March, at 2:30 am',
    ],
    [
      'a UTC date that is already tomorrow in London',
      '2026-06-30T23:30:00Z',
      'Wednesday, the 1st of July, at 12:30 am',
    ],
  ])('formats %s', (_name, at, text) => {
    expect(londonTime(new Date(at))).toBe(text);
  });

  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [24, '24th'],
    [31, '31st'],
  ])('writes day %i as %s', (day, ordinal) => {
    const at = new Date(Date.UTC(2026, 0, day, 12));
    expect(londonTime(at)).toContain(`, the ${ordinal} of January,`);
  });
});

describe('approvalLabel', () => {
  const at = new Date('2026-10-12T14:00:00Z');

  it('names the approver, their login, and the London time in small italics', () => {
    expect(approvalLabel({ name: 'Ben', login: APPROVER, at })).toBe(
      `<sub><i>Approved by Ben @${APPROVER} on Monday, the 12th of October, at 3 pm</i></sub>`,
    );
  });

  it.each([null, '', '   '])('falls back to the login when the profile name is %p', (name) => {
    expect(approvalLabel({ name, login: APPROVER, at })).toContain(
      `Approved by ${APPROVER} @${APPROVER} on`,
    );
  });

  it('renders a hostile profile name as plain text on one line', () => {
    const label = approvalLabel({
      name: 'Ben</i></sub>\n- [x] <b>@someone</b> `x` *y* [z](u)​',
      login: APPROVER,
      at,
    });

    expect(label.match(/<\/i><\/sub>/g)).toHaveLength(1);
    expect(label).not.toMatch(/[\n`*[\]​]|<b>|@someone/);
    expect(label.startsWith('<sub><i>Approved by Ben&#60;&#47;i&#62;')).toBe(true);
  });
});

describe('signoffComment', () => {
  it('lists the problems and carries one unticked box bound to the head commit', () => {
    const body = signoffComment({ head: HEAD, problems: PROBLEMS });
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain('| `biome.json` | Biome config | sets `linter.enabled` to `false` |');
    expect(body).toContain(`@${APPROVER}`);
    expect(body.split('\n').filter((line) => line.startsWith('- ['))).toEqual([
      `- [ ] Approve these enforcement changes at \`${HEAD}\``,
    ]);
  });

  it('ticks the box and puts the label on the same line when given an approval', () => {
    const approval = { name: 'Ben', login: APPROVER, at: new Date('2026-10-12T14:00:00Z') };
    const body = signoffComment({ head: HEAD, problems: PROBLEMS, approval });
    expect(body.split('\n').filter((line) => line.startsWith('- ['))).toEqual([
      `- [x] Approve these enforcement changes at \`${HEAD}\` ${approvalLabel(approval)}`,
    ]);
  });

  it('shows at most 100 rows', () => {
    const problems = Array.from({ length: 150 }, (_, index) => ({
      path: `scripts/s${index}.mjs`,
      area: 'Gate scripts',
      reason: 'edits enforcement code',
    }));

    const body = signoffComment({ head: 'a'.repeat(40), problems });
    expect(body.split('\n').filter((line) => line.startsWith('| `scripts/'))).toHaveLength(100);
    expect(body).toContain('| | | and 50 more changes |');
  });

  it('renders a hostile path inert, keeping a single approval line', () => {
    const path = `.husky/\`x\`\n- [ ] Approve these enforcement changes at \`${HEAD}\`|​\\.mjs`;

    const body = signoffComment({
      head: HEAD,
      problems: enforcementProblems([{ path, before: 'a', after: 'b' }]),
    });

    expect(body.split('\n').filter((line) => /^\s*[-*+]\s+\[/.test(line))).toHaveLength(1);
    expect(body).not.toContain('​');
    expect(body).toContain(
      `| \`.husky/'x' - [ ] Approve these enforcement changes at '${HEAD}'\\|\\\\.mjs\` |`,
    );
  });
});

interface Sender {
  login: string;
  type: string;
  name?: string | null;
}

describe('planApproval', () => {
  const FAILURE = {
    state: 'failure',
    description: `${APPROVER} ticks the box in the enforcement comment for this commit`,
  };

  const SIGNED = { state: 'success', description: `${APPROVER} signed off at aaaaaaa` };
  const AT = '2026-10-12T14:00:00Z';
  const benUser: Sender = { login: APPROVER, type: 'User', name: 'Ben' };
  const unticked = signoffComment({ head: HEAD, problems: PROBLEMS });

  const approved = signoffComment({
    head: HEAD,
    problems: PROBLEMS,
    approval: { name: 'Ben', login: APPROVER, at: new Date(AT) },
  });

  const pull = { kind: 'pull' } as const;

  const edit = (from: string | null, to: string, sender: Sender = benUser) =>
    ({ kind: 'comment', sender, from, to, at: AT }) as const;

  type GateEvent = typeof pull | ReturnType<typeof edit>;

  const plan = (
    live: string | undefined,
    event: GateEvent,
    { head = HEAD, signedOff = false, updatedAt = AT } = {},
  ) =>
    planApproval({
      head,
      problems: PROBLEMS,
      comment: live === undefined ? undefined : { body: live, updatedAt },
      signedOff,
      event,
    });

  it('plans no comment and a green status when nothing loosens enforcement', () => {
    expect(
      planApproval({ head: HEAD, problems: [], comment: undefined, signedOff: false, event: pull }),
    ).toEqual({
      commentBody: null,
      status: { state: 'success', description: 'Nothing in this PR loosens enforcement' },
    });
  });

  it('clears an existing comment to a body without a checkbox when nothing loosens enforcement', () => {
    const result = planApproval({
      head: HEAD,
      problems: [],
      comment: { body: approved },
      signedOff: true,
      event: pull,
    });

    expect(result.commentBody?.startsWith(COMMENT_MARKER)).toBe(true);
    expect(result.commentBody).not.toContain('[');
    expect(result.status.state).toBe('success');
  });

  it('asks for sign-off when the comment is missing', () => {
    expect(plan(undefined, pull)).toEqual({
      commentBody: unticked,
      status: FAILURE,
    });
  });

  it('accepts only the configured approver when ENFORCEMENT_APPROVER is set', () => {
    const previous = process.env.ENFORCEMENT_APPROVER;
    process.env.ENFORCEMENT_APPROVER = 'template-maintainer';

    try {
      jest.isolateModules(() => {
        const configured: typeof import('./enforcement-approval.mjs') = require('./enforcement-approval.mjs');

        const from = configured.signoffComment({ head: HEAD, problems: PROBLEMS });
        const to = tick(from);

        const statusFor = (login: string) =>
          configured.planApproval({
            head: HEAD,
            problems: PROBLEMS,
            comment: { body: to, updatedAt: AT },
            signedOff: false,
            event: edit(from, to, { login, type: 'User' }),
          }).status.state;

        expect(statusFor('template-maintainer')).toBe('success');
        expect(statusFor('BenSheridanEdwards')).toBe('failure');
        expect(statusFor('someone')).toBe('failure');
      });
    } finally {
      if (previous === undefined) delete process.env.ENFORCEMENT_APPROVER;
      else process.env.ENFORCEMENT_APPROVER = previous;
    }
  });

  it('approves a fresh tick by the approver and labels the box with who and when', () => {
    expect(plan(tick(unticked), edit(unticked, tick(unticked)))).toEqual({
      commentBody: approved,
      status: SIGNED,
    });
  });

  it.each([
    ['[X]', tick(unticked, 'X')],
    ['CRLF', tick(unticked).replaceAll('\n', '\r\n')],
    ['a trailing newline', `${tick(unticked)}\n`],
  ])('approves a fresh %s tick', (_name, ticked) => {
    expect(plan(ticked, edit(unticked, ticked)).status).toEqual(SIGNED);
  });

  it('falls back to the login when the approver has no profile name', () => {
    const result = plan(tick(unticked), edit(unticked, tick(unticked), { ...benUser, name: null }));
    expect(result.commentBody).toContain(`Approved by ${APPROVER} @${APPROVER} on`);
  });

  it.each<[string, Sender]>([
    ['a Bot that shares the approver login', { login: APPROVER, type: 'Bot' }],
    ['github-actions', { login: 'github-actions[bot]', type: 'Bot' }],
    ['another user', { login: 'someone', type: 'User', name: 'Ben' }],
    ['a lowercased login', { login: 'bensheridanedwards', type: 'User' }],
  ])('clears a tick by %s, shows no label, and names them in the comment', (_name, sender) => {
    const result = plan(tick(unticked), edit(unticked, tick(unticked), sender));
    expect(result.commentBody).toBe(
      signoffComment({ head: HEAD, problems: PROBLEMS, refusedBy: sender.login }),
    );
    expect(result.commentBody).toContain(`A tick by \`${sender.login}\` was cleared.`);
    expect(result.commentBody).toContain(
      `\n- [ ] Approve these enforcement changes at \`${HEAD}\`\n`,
    );
    expect(result.commentBody).not.toContain('Approved by');
    expect(result.status).toEqual(FAILURE);
  });

  it('approves a fresh tick on a comment that names a cleared tick, and drops the note', () => {
    const noted = signoffComment({ head: HEAD, problems: PROBLEMS, refusedBy: 'someone' });
    expect(plan(tick(noted), edit(noted, tick(noted)))).toEqual({
      commentBody: approved,
      status: SIGNED,
    });
  });

  it('clears an approver edit that changes other text and keeps the tick', () => {
    const reworded = tick(unticked).replace('This PR loosens', 'This PR quietly loosens');
    expect(plan(reworded, edit(tick(unticked), reworded))).toEqual({
      commentBody: unticked,
      status: FAILURE,
    });
  });

  it('clears an approver edit that re-saves an approved comment without the label', () => {
    expect(plan(tick(unticked), edit(approved, tick(unticked))).status).toEqual(FAILURE);
  });

  it('clears a tick that rewrites the head commit in the box line', () => {
    const forged = tick(unticked).replace(`\`${HEAD}\``, `\`${NEXT}\``);
    const result = plan(forged, edit(unticked, forged));
    expect(result.commentBody).toBe(unticked);
    expect(result.status).toEqual(FAILURE);
  });

  it('clears a label typed into the comment, whoever types it', () => {
    expect(plan(approved, edit(unticked, approved))).toEqual({
      commentBody: unticked,
      status: FAILURE,
    });
    const byOther = plan(approved, edit(unticked, approved, { login: 'someone', type: 'User' }));
    expect(byOther.commentBody).toBe(
      signoffComment({ head: HEAD, problems: PROBLEMS, refusedBy: 'someone' }),
    );
    expect(byOther.status).toEqual(FAILURE);
  });

  it('clears a tick on the comment for an earlier head', () => {
    const old = signoffComment({ head: NEXT, problems: PROBLEMS });
    expect(plan(tick(old), edit(old, tick(old)))).toEqual({
      commentBody: unticked,
      status: FAILURE,
    });
  });

  it('clears a body edit the event reports without a previous body', () => {
    expect(plan(tick(unticked), edit(null, tick(unticked))).status).toEqual(FAILURE);
  });

  it('removes the label when the approver unticks', () => {
    const untick = approved.replace('- [x] ', '- [ ] ');
    const result = plan(untick, edit(approved, untick));
    expect(result.commentBody).toBe(unticked);
    expect(result.commentBody).not.toContain('Approved by');
    expect(result.status).toEqual(FAILURE);
  });

  it('lets an untick win over the label the gate wrote for the tick just before it', () => {
    const untick = tick(unticked).replace('- [x] ', '- [ ] ');
    expect(plan(approved, edit(tick(unticked), untick))).toEqual({
      commentBody: unticked,
      status: FAILURE,
    });
  });

  it('does not approve a tick the comment has since moved past', () => {
    expect(plan(unticked, edit(unticked, tick(unticked)))).toEqual({
      commentBody: unticked,
      status: FAILURE,
    });
  });

  it('does not approve a tick when the comment was edited again since, even back to the same body', () => {
    expect(
      plan(tick(unticked), edit(unticked, tick(unticked)), { updatedAt: '2026-10-12T14:06:00Z' }),
    ).toEqual({ commentBody: unticked, status: FAILURE });
  });

  it('keeps the label and posts no status when the tick run is rerun', () => {
    expect(
      plan(approved, edit(unticked, tick(unticked)), { signedOff: true, updatedAt: 'later' }),
    ).toEqual({
      commentBody: approved,
      status: null,
    });
  });

  it('keeps the label for its head on a PR event and posts no status', () => {
    expect(plan(approved, pull, { signedOff: true })).toEqual({
      commentBody: approved,
      status: null,
    });
  });

  it('clears a label on a PR event when the gate has not signed off this head', () => {
    expect(plan(approved, pull)).toEqual({ commentBody: unticked, status: FAILURE });
  });

  it('rewrites an approved comment for an earlier head unticked for the new head', () => {
    const result = plan(approved, pull, { head: NEXT, signedOff: true });
    expect(result.commentBody).toBe(signoffComment({ head: NEXT, problems: PROBLEMS }));
    expect(result.commentBody).not.toContain('Approved by');
    expect(result.status).toEqual(FAILURE);
  });

  it('clears a bare tick found on a PR event', () => {
    expect(plan(tick(unticked), pull)).toEqual({
      commentBody: unticked,
      status: FAILURE,
    });
  });

  it('keeps every status description inside the 140-character limit', () => {
    const plans = [
      plan(undefined, pull),
      plan(tick(unticked), edit(unticked, tick(unticked))),
      planApproval({ head: HEAD, problems: [], comment: undefined, signedOff: false, event: pull }),
    ];

    plans.forEach(({ status }) => {
      expect(status?.description.length).toBeLessThan(140);
    });
  });
});

interface Comment {
  id: number;
  node_id: string;
  body: string;
  updated_at?: string;
  user: { login: string };
}

interface CommitStatusParameters {
  owner: string;
  repo: string;
  sha: string;
  context: string;
  state: 'success' | 'failure';
  description: string;
}

interface PaginationParameters {
  owner: string;
  repo: string;
  per_page: number;
  pull_number?: number;
  issue_number?: number;
}

interface GitHubState {
  head: string;
  profiles: Record<string, string | null>;
}

interface GitHubCalls {
  createComment: string[];
  updateComment: number;
  createCommitStatus: CommitStatusParameters[];
}

function fakeGitHub({
  files,
  contents,
  comments = [],
}: {
  files: { filename: string; previous_filename?: string }[];
  contents: Record<string, Record<string, string>>;
  comments?: Comment[];
}) {
  const state: GitHubState = { head: HEAD, profiles: { [APPROVER]: 'Ben' } };

  const calls: GitHubCalls = {
    createComment: [],
    updateComment: 0,
    createCommitStatus: [],
  };

  const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

  const rest = {
    pulls: {
      get: async () => ({ data: { head: { sha: state.head }, base: { sha: 'base-sha' } } }),
      listFiles: async () => ({ data: files }),
    },
    issues: {
      listComments: async () => ({ data: comments }),
      createComment: async ({ body }: { body: string }) => {
        calls.createComment.push(body);
        const id = comments.length + 1;
        comments.push({ id, node_id: `node-${id}`, body, user: { login: GATE_AUTHOR } });

        return { data: {} };
      },
      updateComment: async ({ comment_id, body }: { comment_id: number; body: string }) => {
        calls.updateComment += 1;
        const comment = comments.find((entry) => entry.id === comment_id);

        if (comment) {
          comment.body = body;
          comment.updated_at = `gate write ${calls.updateComment}`;
        }

        return { data: {} };
      },
    },
    repos: {
      compareCommitsWithBasehead: async ({ basehead }: { basehead: string }) => {
        expect(basehead).toBe(`base-sha...${state.head}`);

        return { data: { merge_base_commit: { sha: MERGE_BASE } } };
      },
      getContent: async ({ path, ref }: { path: string; ref: string }) => {
        const content = contents[ref]?.[path];

        if (content === undefined) throw notFound();

        return { data: content };
      },
      createCommitStatus: async (parameters: CommitStatusParameters) => {
        calls.createCommitStatus.push(parameters);

        return { data: {} };
      },
      listCommitStatusesForRef: async ({ ref }: { ref: string }) => ({
        data: calls.createCommitStatus
          .filter((status) => status.sha === ref)
          .map((status) => ({ ...status, creator: { login: GATE_AUTHOR } }))
          .reverse(),
      }),
    },
    users: {
      getByUsername: async ({ username }: { username: string }) => ({
        data: { login: username, name: state.profiles[username] ?? null },
      }),
    },
  };

  const github = {
    rest,
    paginate: async <T>(
      method: (parameters: PaginationParameters) => Promise<{ data: T[] }>,
      parameters: PaginationParameters,
    ) => (await method(parameters)).data,
  };

  /** Edit the gate's comment as `sender` and return the issue_comment context GitHub sends. */
  const editBy = (sender: Editor, edit: (body: string) => string, at = '2026-10-12T14:00:00Z') => {
    const comment = comments[0];

    if (!comment) throw new Error('no comment to edit');
    const from = comment.body;
    comment.body = edit(from);
    comment.updated_at = at;

    return {
      eventName: 'issue_comment',
      repo,
      payload: {
        action: 'edited',
        issue: { number: 7, pull_request: {} },
        comment: { ...comment },
        changes: { body: { from } },
        sender: { login: sender.login, type: sender.type },
      },
    };
  };

  return { github, comments, calls, state, editBy };
}

const repo = { owner: 'o', repo: 'r' };
const core = { info: () => undefined };

const pullRequestContext = {
  eventName: 'pull_request_target',
  repo,
  payload: { action: 'synchronize', pull_request: { number: 7, head: { sha: HEAD } } },
};

describe('run', () => {
  const loosening = () => ({
    files: [{ filename: '.husky/pre-commit' }],
    contents: {
      [MERGE_BASE]: { '.husky/pre-commit': 'npx lint-staged' },
      [HEAD]: { '.husky/pre-commit': 'true' },
      [NEXT]: { '.husky/pre-commit': 'exit 0' },
    },
  });

  const HOOK = [{ path: '.husky/pre-commit', area: 'Git hooks', reason: 'edits enforcement code' }];
  const LABEL = `<sub><i>Approved by Ben @${APPROVER} on Monday, the 12th of October, at 3 pm</i></sub>`;

  const boxLines = (body: string | undefined) =>
    (body ?? '').split('\n').filter((line) => line.startsWith('- ['));

  it('requires a fresh Ben tick for product intent at each head', async () => {
    const path = 'docs/prd/greeting.md';

    const { github, comments, calls, state, editBy } = fakeGitHub({
      files: [{ filename: path }],
      contents: {
        [MERGE_BASE]: { [path]: 'intent' },
        [HEAD]: { [path]: 'updated intent' },
        [NEXT]: { [path]: 'next intent' },
      },
    });

    await run({ github, context: pullRequestContext, core });
    expect(comments[0]?.body).toContain(
      '| `docs/prd/greeting.md` | Product intent | edits product intent |',
    );
    await run({ github, context: editBy(ben, (body) => tick(body)), core });
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [x] Approve these enforcement changes at \`${HEAD}\` ${LABEL}`,
    ]);
    state.head = NEXT;
    await run({ github, context: pullRequestContext, core });
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [ ] Approve these enforcement changes at \`${NEXT}\``,
    ]);
    expect(calls.createCommitStatus.map((status) => [status.sha, status.state])).toEqual([
      [HEAD, 'failure'],
      [HEAD, 'success'],
      [NEXT, 'failure'],
    ]);
  });

  it('posts one sign-off comment and a red status on the head, then stays idle on a rerun', async () => {
    const { github, comments, calls } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    expect(comments.map((comment) => comment.body)).toEqual([
      signoffComment({ head: HEAD, problems: HOOK }),
    ]);
    expect(calls.createCommitStatus).toEqual([
      expect.objectContaining({ ...repo, sha: HEAD, context: STATUS_CONTEXT, state: 'failure' }),
    ]);

    await run({ github, context: pullRequestContext, core });
    expect(calls.createComment).toHaveLength(1);
    expect(calls.updateComment).toBe(0);
  });

  it('reads a file absent at the merge base as added', async () => {
    const { github, comments } = fakeGitHub({
      files: [{ filename: '.husky/pre-push' }],
      contents: { [HEAD]: { '.husky/pre-push': 'pnpm verify' } },
    });

    await run({ github, context: pullRequestContext, core });
    expect(comments[0]?.body).toContain(
      '| `.husky/pre-push` | Git hooks | adds enforcement code |',
    );
  });

  it('fails loudly when reading a file fails for any reason but absence', async () => {
    const fake = fakeGitHub(loosening());
    fake.github.rest.repos.getContent = async () => {
      throw Object.assign(new Error('Server Error'), { status: 500 });
    };

    await expect(run({ github: fake.github, context: pullRequestContext, core })).rejects.toThrow(
      'Server Error',
    );
  });

  it('labels the box with the approver and the London time of the tick, and turns the head green', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    await run({ github, context: editBy(ben, (body) => tick(body)), core });
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [x] Approve these enforcement changes at \`${HEAD}\` ${LABEL}`,
    ]);
    expect(calls.createCommitStatus.at(-1)).toEqual(
      expect.objectContaining({ sha: HEAD, state: 'success' }),
    );
    expect(calls.createComment).toHaveLength(1);
  });

  it('accepts the trailing newline a GitHub checkbox click appends', async () => {
    const { github, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    await run({ github, context: editBy(ben, (body) => `${tick(body)}\n`), core });
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'success' }));
  });

  it('writes nothing and posts no status when the tick run is rerun', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    const tickContext = editBy(ben, (body) => tick(body));
    await run({ github, context: tickContext, core });
    const labelled = comments[0]?.body;
    const writes = [calls.updateComment, calls.createCommitStatus.length];
    await run({ github, context: tickContext, core });
    expect(comments[0]?.body).toBe(labelled);
    expect([calls.updateComment, calls.createCommitStatus.length]).toEqual(writes);
  });

  it('does not re-approve when a tick run is rerun after the approver unticked', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    const tickContext = editBy(ben, (body) => tick(body));
    await run({ github, context: tickContext, core });
    await run({ github, context: editBy(ben, (body) => body.replace('- [x] ', '- [ ] ')), core });
    await run({ github, context: tickContext, core });
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [ ] Approve these enforcement changes at \`${HEAD}\``,
    ]);
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'failure' }));
  });

  it('does not re-approve a rerun tick after someone restores the ticked body over an untick', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    const tickContext = editBy(ben, (body) => tick(body));
    await run({ github, context: tickContext, core });
    await run({
      github,
      context: editBy(ben, (body) => body.replace('- [x] ', '- [ ] '), '2026-10-12T14:05:00Z'),
      core,
    });
    editBy(
      { login: 'someone', type: 'User' },
      () => tickContext.payload.comment.body,
      '2026-10-12T14:06:00Z',
    );
    await run({ github, context: tickContext, core });
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [ ] Approve these enforcement changes at \`${HEAD}\``,
    ]);
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'failure' }));
  });

  it('keeps the label on a later PR event for the same head and posts no status', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    await run({ github, context: editBy(ben, (body) => tick(body)), core });
    const labelled = comments[0]?.body;
    const statuses = calls.createCommitStatus.length;
    await run({
      github,
      context: {
        ...pullRequestContext,
        payload: { ...pullRequestContext.payload, action: 'edited' },
      },
      core,
    });
    expect(comments[0]?.body).toBe(labelled);
    expect(calls.createCommitStatus).toHaveLength(statuses);
  });

  it('clears a label typed into the comment on the next PR event when its own run never ran', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    editBy({ login: 'someone', type: 'User' }, (body) =>
      body.replace('- [ ] Approve', '- [x] Approve').replace(/`\n/, `\` ${LABEL}\n`),
    );
    await run({ github, context: pullRequestContext, core });
    expect(comments[0]?.body).toBe(signoffComment({ head: HEAD, problems: HOOK }));
    expect(calls.createCommitStatus.map((status) => status.state)).toEqual(['failure', 'failure']);
  });

  it('removes the label and turns red when the approver unticks', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    await run({ github, context: editBy(ben, (body) => tick(body)), core });
    await run({ github, context: editBy(ben, (body) => body.replace('- [x] ', '- [ ] ')), core });
    expect(comments[0]?.body).toBe(signoffComment({ head: HEAD, problems: HOOK }));
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'failure' }));
  });

  it('clears a tick by anyone else with no label, names them in the one comment, and keeps the status red', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    await run({
      github,
      context: editBy({ login: 'someone', type: 'User' }, (body) => tick(body)),
      core,
    });
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain('A tick by `someone` was cleared.');
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [ ] Approve these enforcement changes at \`${HEAD}\``,
    ]);
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'failure' }));

    await run({ github, context: editBy(ben, (body) => tick(body), '2026-10-12T14:00:00Z'), core });
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [x] Approve these enforcement changes at \`${HEAD}\` ${LABEL}`,
    ]);
    expect(comments[0]?.body).not.toContain('was cleared');
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'success' }));
  });

  it('reclaims a gate comment whose marker an edit removed when that edit run never ran', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    editBy({ login: 'someone', type: 'User' }, (body) =>
      body
        .replace(COMMENT_MARKER, '')
        .replace('- [ ] Approve', '- [x] Approve')
        .replace(/`\n/, `\` ${LABEL}\n`),
    );
    await run({ github, context: pullRequestContext, core });
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe(signoffComment({ head: HEAD, problems: HOOK }));
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'failure' }));
  });

  it('keeps the status red and clears a label typed into the comment', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    await run({
      github,
      context: editBy(ben, (body) =>
        body.replace('- [ ] Approve', '- [x] Approve').replace(/`\n/, `\` ${LABEL}\n`),
      ),
      core,
    });
    expect(comments[0]?.body).toBe(signoffComment({ head: HEAD, problems: HOOK }));
    expect(calls.createCommitStatus.map((status) => status.state)).toEqual(['failure', 'failure']);
  });

  it('re-renders unticked with no label for a new head after an approval', async () => {
    const { github, comments, calls, state, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    await run({ github, context: editBy(ben, (body) => tick(body)), core });
    state.head = NEXT;
    await run({ github, context: pullRequestContext, core });
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [ ] Approve these enforcement changes at \`${NEXT}\``,
    ]);
    expect(calls.createCommitStatus.at(-1)).toEqual(
      expect.objectContaining({ sha: NEXT, state: 'failure' }),
    );
  });

  it('clears a tick on the old head comment that races a push', async () => {
    const { github, comments, calls, state, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    const tickContext = editBy(ben, (body) => tick(body));
    state.head = NEXT;
    await run({ github, context: tickContext, core });
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [ ] Approve these enforcement changes at \`${NEXT}\``,
    ]);
    expect(calls.createCommitStatus.map((status) => [status.sha, status.state])).toEqual([
      [HEAD, 'failure'],
      [NEXT, 'failure'],
    ]);
  });

  it('ends unticked when an untick and a re-tick both land before either run reads the comment', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    await run({ github, context: editBy(ben, (body) => tick(body)), core });
    const untick = editBy(ben, (body) => body.replace('- [x] ', '- [ ] '));
    const retick = editBy(ben, (body) => body.replace('- [ ] ', '- [x] '));
    await run({ github, context: untick, core });
    await run({ github, context: retick, core });
    expect(boxLines(comments[0]?.body)).toEqual([
      `- [ ] Approve these enforcement changes at \`${HEAD}\``,
    ]);
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'failure' }));
  });

  it('restores the sign-off comment when an edit removes its marker', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    await run({
      github,
      context: editBy(ben, (body) => tick(body).replace(COMMENT_MARKER, '')),
      core,
    });
    expect(comments[0]?.body).toBe(signoffComment({ head: HEAD, problems: HOOK }));
    expect(calls.createComment).toHaveLength(1);
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'failure' }));
  });

  it('ignores a ticked lookalike comment that a person posted', async () => {
    const forged = tick(signoffComment({ head: HEAD, problems: HOOK }));

    const fake = fakeGitHub({
      ...loosening(),
      comments: [{ id: 1, node_id: 'node-1', body: forged, user: { login: APPROVER } }],
    });

    await run({ github: fake.github, context: pullRequestContext, core });
    expect(fake.calls.createComment).toHaveLength(1);
    expect(fake.calls.createCommitStatus).toEqual([expect.objectContaining({ state: 'failure' })]);
  });

  it('asks for sign-off when the PR lists as many files as the API returns', async () => {
    const files = Array.from({ length: LIST_FILES_LIMIT }, (_, index) => ({
      filename: `src/file${index}.ts`,
    }));

    const { github, comments, calls } = fakeGitHub({ files, contents: {} });
    await run({ github, context: pullRequestContext, core });
    expect(comments[0]?.body).toContain('| `this PR` | Gate input |');
    expect(calls.createCommitStatus).toEqual([expect.objectContaining({ state: 'failure' })]);
  });

  it('sets a green status and posts nothing when nothing loosens enforcement', async () => {
    const { github, calls } = fakeGitHub({
      files: [{ filename: 'src/App.tsx' }, { filename: 'biome.json' }],
      contents: {
        [MERGE_BASE]: { 'biome.json': '{"linter":{"rules":{"style":{"useConst":"warn"}}}}' },
        [HEAD]: { 'biome.json': '{"linter":{"rules":{"style":{"useConst":"error"}}}}' },
      },
    });

    await run({ github, context: pullRequestContext, core });
    expect(calls.createComment).toEqual([]);
    expect(calls.createCommitStatus).toEqual([
      expect.objectContaining({ sha: HEAD, state: 'success' }),
    ]);
  });

  it('posts the status on the live head, not the head the event names', async () => {
    const { github, calls, state } = fakeGitHub(loosening());
    state.head = NEXT;
    await run({ github, context: pullRequestContext, core });
    expect(calls.createCommitStatus).toEqual([
      expect.objectContaining({ sha: NEXT, state: 'failure' }),
    ]);
  });
});

describe('enforcement-approval workflow', () => {
  const workflow = readFileSync(
    join(process.cwd(), '.github/workflows/enforcement-approval.yml'),
    'utf8',
  );

  it('runs on PR events and on edited PR comments', () => {
    expect(workflow).toMatch(
      /pull_request_target:\s*\n\s*types: \[opened, edited, synchronize, reopened\]/,
    );
    expect(workflow).toMatch(/issue_comment:\s*\n\s*types: \[edited\]/);
  });

  it('checks out only the default branch copy of the script and runs no PR code', () => {
    expect(workflow).toContain('ref: $' + '{{ github.event.repository.default_branch }}');
    expect(workflow).toContain('sparse-checkout: scripts/enforcement-approval.mjs');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toContain('pull_request.head');
    expect(workflow).not.toMatch(/^\s*(-\s+)?run:/m);
  });

  it('queues gate runs per PR only for jobs that run, so an unrelated comment edit cancels nothing', () => {
    expect(workflow).not.toMatch(/^concurrency:/m);
    expect(workflow).toMatch(
      /\n {2}approve:\n(?: {4}.*\n| *#.*\n)*? {4}concurrency:\n {6}group: enforcement-approval-/,
    );
  });

  it('lets every edit of the gate comment reach the script, whoever made it', () => {
    expect(workflow).not.toContain('sender.type');
    expect(workflow).toContain(`github.event.comment.user.login == '${GATE_AUTHOR}'`);
    expect(workflow).toContain(`startsWith(github.event.comment.body, '${COMMENT_MARKER}')`);
    expect(workflow).toContain(`startsWith(github.event.changes.body.from, '${COMMENT_MARKER}')`);
  });
});
