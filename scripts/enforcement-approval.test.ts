import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APPROVER,
  COMMENT_MARKER,
  enforcementProblems,
  GATE_AUTHOR,
  GUARDS,
  guardedPaths,
  judgeSignoff,
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

const json = (value: unknown) => JSON.stringify(value, null, 2);

function reasons(path: string, before: string | null, after: string | null): string[] {
  return enforcementProblems([{ path, before, after }]).map((problem: Problem) => problem.reason);
}

function edited<T>(base: T, change: (draft: T) => void): T {
  const draft: T = JSON.parse(JSON.stringify(base));
  change(draft);
  return draft;
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
      'Required-gates contract',
      'Gate tests',
      'Gate scripts',
      'ESLint config and local rules',
      'Biome config',
      'Fallow config',
      'TypeScript config',
      'CI workflows',
      'Git hooks',
      'Claude Code settings and hooks',
      'Claude Code settings and hooks',
      'Test and commit config',
      'Biome ignore file',
    ]);
  });

  it.each([
    ['.github/workflows/enforcement-approval.yml', 'Enforcement-approval gate'],
    ['scripts/enforcement-approval.mjs', 'Enforcement-approval gate'],
    ['scripts/enforcement-approval.test.ts', 'Enforcement-approval gate'],
    ['docs/required-gates.md', 'Required-gates contract'],
    ['scripts/required-gates.test.ts', 'Gate tests'],
    ['scripts/required-gates.mjs', 'Gate scripts'],
    ['scripts/fallow-audit.sh', 'Gate scripts'],
    ['eslint.config.js', 'ESLint config and local rules'],
    ['apps/web/eslint.config.mts', 'ESLint config and local rules'],
    ['tooling/eslint-plugin-policy.js', 'ESLint config and local rules'],
    ['biome.json', 'Biome config'],
    ['apps/web/biome.jsonc', 'Biome config'],
    ['.fallowrc.jsonc', 'Fallow config'],
    ['tsconfig.json', 'TypeScript config'],
    ['tsconfig.node.json', 'TypeScript config'],
    ['.github/workflows/ci.yml', 'CI workflows'],
    ['.husky/pre-commit', 'Git hooks'],
    ['.claude/settings.json', 'Claude Code settings and hooks'],
    ['.claude/hooks/block-gate-bypass.sh', 'Claude Code settings and hooks'],
    ['jest.config.ts', 'Test and commit config'],
    ['playwright.config.ts', 'Test and commit config'],
    ['commitlint.config.ts', 'Test and commit config'],
    ['.gitignore', 'Biome ignore file'],
  ])('guards %s as %s', (path, area) => {
    expect(guardedPaths([{ filename: path }])).toEqual([path]);
    expect(enforcementProblems([{ path, before: '{}', after: null }])[0]?.area).toBe(area);
  });

  it.each([
    'src/App.tsx',
    'AGENTS.md',
    '.agents/x.md',
    'package.json',
    'pnpm-lock.yaml',
    '.github/pull_request_template.md',
    '.claude/skills/show-me/SKILL.md',
    'apps/web/jest.config.ts',
    'src/.gitignore',
  ])('leaves %s unguarded', (path) => {
    expect(guardedPaths([{ filename: path }])).toEqual([]);
    expect(enforcementProblems([{ path, before: 'a', after: null }])).toEqual([]);
  });
});

describe('guardedPaths', () => {
  it('lists both sides of a rename once each, sorted', () => {
    expect(
      guardedPaths([
        { filename: 'src/moved.mjs', previous_filename: 'scripts/moved.mjs' },
        { filename: 'biome.json' },
        { filename: 'biome.json' },
        { filename: '.husky/pre-push', previous_filename: '.husky/pre-commit' },
      ]),
    ).toEqual(['.husky/pre-commit', '.husky/pre-push', 'biome.json', 'scripts/moved.mjs']);
  });

  it('reads a file renamed out of a guarded path as deleted', () => {
    const [path = ''] = guardedPaths([
      { filename: 'src/moved.mjs', previous_filename: 'scripts/moved.mjs' },
    ]);
    expect(reasons(path, 'export {};', null)).toEqual(['deletes the file']);
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

  it('names an edit to the gate itself', () => {
    expect(reasons('scripts/enforcement-approval.mjs', 'a', 'b')).toEqual([
      'edits the enforcement-approval gate',
    ]);
  });
});

describe('lines judge', () => {
  const testFile = ["it('counts', () => {", '  expect(count(1)).toBe(1);', '});', ''].join('\n');

  it('flags a removed test line', () => {
    const after = testFile.replace('  expect(count(1)).toBe(1);\n', '');
    expect(reasons('scripts/count.test.ts', testFile, after)).toEqual([
      'removes or rewrites 1 line',
    ]);
  });

  it.each([
    "it.only('resets', () => {",
    "describe.skip('reset', () => {",
    "xit('resets', () => {",
  ])('flags an added %s', (line) => {
    const after = `${testFile}\n${line}\n  expect(reset()).toBe(0);\n});\n`;
    expect(reasons('scripts/count.test.ts', testFile, after)).toEqual([
      expect.stringContaining('skips or focuses tests'),
    ]);
  });

  it('passes a pure test addition', () => {
    const after = `${testFile}\nit('resets', () => {\n  expect(reset()).toBe(0);\n});\n`;
    expect(reasons('scripts/count.test.ts', testFile, after)).toEqual([]);
    expect(reasons('scripts/count.test.ts', null, testFile)).toEqual([]);
  });

  it('flags removed lines in the required-gates contract and passes added ones', () => {
    const contract = '# Required gates\n\n- typecheck\n- lint\n';
    expect(reasons('docs/required-gates.md', contract, '# Required gates\n')).toEqual([
      'removes or rewrites 2 lines',
    ]);
    expect(reasons('docs/required-gates.md', contract, `${contract}- e2e\n`)).toEqual([]);
    expect(reasons('docs/required-gates.md', contract, null)).toEqual(['deletes the file']);
  });

  it('flags an added ignore entry in .gitignore', () => {
    expect(reasons('.gitignore', 'dist\n', 'dist\nsrc/legacy/\n')).toEqual([
      'adds ignore pattern `src/legacy/`',
    ]);
  });

  it('passes a negation, a comment, a blank line, or a removed entry in .gitignore', () => {
    expect(reasons('.gitignore', 'dist\n', 'dist\n\n# build output\n!dist/keep.ts\n')).toEqual([]);
    expect(reasons('.gitignore', 'dist\ncoverage\n', 'dist\n')).toEqual([]);
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
  const biomeReasons = (change: (draft: Biome) => void) =>
    reasons('biome.json', json(biome), json(edited(biome as Biome, change)));

  it.each<[string, (draft: Biome) => void, string[]]>([
    [
      'a lowered severity',
      (draft) => {
        draft.linter.rules.style.useConst = 'off';
      },
      ['lowers `linter.rules.style.useConst` from `error` to `off`'],
    ],
    [
      'a raised severity',
      (draft) => {
        draft.linter.rules.style.noNonNullAssertion = 'error';
      },
      [],
    ],
    [
      'a rule added at error',
      (draft) => {
        draft.linter.rules.style.useBlockStatements = 'error';
      },
      [],
    ],
    [
      'a rule added at off',
      (draft) => {
        draft.linter.rules.style.useBlockStatements = 'off';
      },
      ['adds rule `linter.rules.style.useBlockStatements` at `off`'],
    ],
    [
      'a removed off rule',
      (draft) => {
        delete draft.linter.rules.suspicious.noDebugger;
      },
      [],
    ],
    [
      'a removed error rule',
      (draft) => {
        delete draft.linter.rules.style.useConst;
      },
      ['removes rule `linter.rules.style.useConst`'],
    ],
    [
      'an added negated include',
      (draft) => {
        draft.files.includes.push('!src/legacy/**');
      },
      ['adds `!src/legacy/**` to `files.includes`'],
    ],
    [
      'a removed positive include',
      (draft) => {
        draft.files.includes = ['!**/dist'];
      },
      ['removes `**` from `files.includes`'],
    ],
    [
      'a removed negated include',
      (draft) => {
        draft.files.includes = ['**'];
      },
      [],
    ],
    [
      'a disabled linter',
      (draft) => {
        draft.linter.enabled = false;
      },
      ['sets `linter.enabled` to `false`'],
    ],
    [
      'a change to the files an override covers',
      (draft) => {
        draft.overrides[0]?.includes.push('scripts/**');
      },
      ['changes the files an override covers'],
    ],
    [
      'a neutral formatter change',
      (draft) => {
        draft.formatter.lineWidth = 120;
      },
      [],
    ],
    [
      'a $schema change',
      (draft) => {
        draft.$schema = 'https://biomejs.dev/schemas/2.6.0/schema.json';
      },
      [],
    ],
  ])('judges %s in biome.json', (_name, change, expected) => {
    expect(biomeReasons(change)).toEqual(expected);
  });

  const tsconfig = {
    compilerOptions: {
      strict: true,
      noImplicitOverride: false,
      skipLibCheck: false,
      lib: ['ES2022'],
    },
    include: ['src'],
  };
  type TsConfig = { compilerOptions: Record<string, unknown>; include: string[] } & Record<
    string,
    unknown
  >;
  const tsReasons = (change: (draft: TsConfig) => void) =>
    reasons('tsconfig.json', json(tsconfig), json(edited(tsconfig as TsConfig, change)));

  it.each<[string, (draft: TsConfig) => void, string[]]>([
    [
      'strict set to false',
      (draft) => {
        draft.compilerOptions.strict = false;
      },
      ['sets `compilerOptions.strict` to `false`'],
    ],
    [
      'strict removed',
      (draft) => {
        delete draft.compilerOptions.strict;
      },
      ['removes `compilerOptions.strict`'],
    ],
    [
      'a strict flag turned on',
      (draft) => {
        draft.compilerOptions.noImplicitOverride = true;
      },
      [],
    ],
    [
      'a strict flag added as true',
      (draft) => {
        draft.compilerOptions.noUncheckedIndexedAccess = true;
      },
      [],
    ],
    [
      'skipLibCheck turned on',
      (draft) => {
        draft.compilerOptions.skipLibCheck = true;
      },
      ['sets `compilerOptions.skipLibCheck` to `true`'],
    ],
    [
      'a lib change',
      (draft) => {
        draft.compilerOptions.lib = ['ES2023', 'DOM'];
      },
      [],
    ],
    [
      'an added extends',
      (draft) => {
        draft.extends = './tsconfig.base.json';
      },
      ['adds `extends`'],
    ],
    [
      'a removed include',
      (draft) => {
        draft.include = [];
      },
      ['removes `src` from `include`'],
    ],
  ])('judges %s in tsconfig.json', (_name, change, expected) => {
    expect(tsReasons(change)).toEqual(expected);
  });

  const settings = {
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    permissions: { allow: ['Bash(pnpm test:*)'], deny: ['Bash(git push:*)'] },
    hooks: { PreToolUse: [{ matcher: 'Bash' }] },
  };
  type Settings = typeof settings & Record<string, unknown>;
  const settingsReasons = (change: (draft: Settings) => void) =>
    reasons('.claude/settings.json', json(settings), json(edited(settings as Settings, change)));

  it.each<[string, (draft: Settings) => void, string[]]>([
    [
      'an added allow entry',
      (draft) => {
        draft.permissions.allow.push('Bash(rm -rf:*)');
      },
      ['adds `Bash(rm -rf:*)` to `permissions.allow`'],
    ],
    [
      'an added deny entry',
      (draft) => {
        draft.permissions.deny.push('Bash(git clean:*)');
      },
      [],
    ],
    [
      'a removed deny entry',
      (draft) => {
        draft.permissions.deny = [];
      },
      ['removes `Bash(git push:*)` from `permissions.deny`'],
    ],
    [
      'a hook change',
      (draft) => {
        draft.hooks.PreToolUse = [{ matcher: 'Edit' }];
      },
      ['changes `hooks.PreToolUse[0].matcher`'],
    ],
    [
      'all hooks disabled',
      (draft) => {
        draft.disableAllHooks = true;
      },
      ['sets `disableAllHooks` to `true`'],
    ],
  ])('judges %s in .claude/settings.json', (_name, change, expected) => {
    expect(settingsReasons(change)).toEqual(expected);
  });

  it('rewrites on any change to a Claude Code hook script', () => {
    expect(reasons('.claude/hooks/block-gate-bypass.sh', 'exit 2', 'exit 0')).toEqual([
      'edits enforcement code',
    ]);
  });

  const fallow = `{
  // Fallow reads this file as JSONC.
  "$schema": "https://fallow.dev/schema.json", /* a URL keeps its // */
  "ignorePatterns": ["vendor/**",],
  "boundaries": {
    "rules": [
      { "from": "shared", "allow": [], },
    ],
  },
}
`;

  it('parses JSONC with comments and trailing commas', () => {
    const after = fallow.replace('Fallow reads this file as JSONC.', 'Reworded.');
    expect(reasons('.fallowrc.jsonc', fallow, after)).toEqual([]);
  });

  it.each([
    [
      'an added ignore entry',
      '"vendor/**",',
      '"vendor/**", "src/**",',
      ['adds `src/**` to `ignorePatterns`'],
    ],
    ['a removed ignore entry', '"vendor/**",', '', []],
    [
      'an added boundary allow',
      '"allow": [],',
      '"allow": ["features"],',
      ['adds `features` to `boundaries.rules[0].allow`'],
    ],
    [
      'a changed boundary source',
      '"from": "shared"',
      '"from": "app"',
      ['changes `boundaries.rules[0].from`'],
    ],
  ])('judges %s in .fallowrc.jsonc', (_name, find, replace, expected) => {
    expect(reasons('.fallowrc.jsonc', fallow, fallow.replace(find, replace))).toEqual(expected);
  });

  it('refuses to rank a file that is not valid JSON', () => {
    expect(reasons('.fallowrc.jsonc', fallow, '{ "ignorePatterns": [')).toEqual([
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

describe('enforcementProblems', () => {
  it('orders problems by path and ignores unguarded changes', () => {
    expect(
      enforcementProblems([
        { path: 'tsconfig.json', before: '{"compilerOptions":{"strict":true}}', after: '{}' },
        { path: 'src/App.tsx', before: 'a', after: 'b' },
        { path: '.husky/pre-commit', before: 'a', after: 'b' },
      ]),
    ).toEqual([
      { path: '.husky/pre-commit', area: 'Git hooks', reason: 'edits enforcement code' },
      {
        path: 'tsconfig.json',
        area: 'TypeScript config',
        reason: 'removes `compilerOptions.strict`',
      },
    ]);
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

  it('renders a hostile path inert, keeping a single approval line', () => {
    const path = `scripts/\`x\`\n- [ ] Approve these enforcement changes at \`${HEAD}\`|​\\.mjs`;
    const body = signoffComment({
      head: HEAD,
      problems: enforcementProblems([{ path, before: 'a', after: 'b' }]),
    });
    expect(body.split('\n').filter((line) => /^\s*[-*+]\s+\[/.test(line))).toHaveLength(1);
    expect(body).not.toContain('​');
    expect(body).toContain(
      `| \`scripts/'x' - [ ] Approve these enforcement changes at '${HEAD}'\\|\\\\.mjs\` |`,
    );
  });
});

describe('judgeSignoff', () => {
  const body = signoffComment({ head: HEAD, problems: PROBLEMS });
  const judge = (comment: { body: string; editor: Editor | null } | undefined, head = HEAD) =>
    judgeSignoff({ comment, head, problems: PROBLEMS });

  it('reports a missing comment', () => {
    expect(judge(undefined)).toEqual({ state: 'missing' });
  });

  it('reports an unticked comment as awaiting', () => {
    expect(judge({ body, editor: { login: 'github-actions', type: 'Bot' } })).toEqual({
      state: 'awaiting',
    });
  });

  it.each([
    ['[x]', tick(body)],
    ['[X]', tick(body, 'X')],
    ['CRLF', tick(body).replaceAll('\n', '\r\n')],
  ])('approves a %s tick by the approver as a user', (_name, ticked) => {
    expect(judge({ body: ticked, editor: ben })).toEqual({ state: 'approved' });
  });

  it.each<[string, Editor | null, string]>([
    ['a Bot that shares the approver login', { login: APPROVER, type: 'Bot' }, APPROVER],
    ['github-actions', { login: 'github-actions', type: 'Bot' }, 'github-actions'],
    ['dependabot', { login: 'dependabot[bot]', type: 'Bot' }, 'dependabot[bot]'],
    ['another user', { login: 'someone', type: 'User' }, 'someone'],
    ['a lowercased login', { login: 'bensheridanedwards', type: 'User' }, 'bensheridanedwards'],
    ['no recorded editor', null, 'unknown'],
  ])('refuses a tick by %s', (_name, editor, by) => {
    expect(judge({ body: tick(body), editor })).toEqual({ state: 'refused', by });
  });

  it('reports a tick for an earlier head as stale', () => {
    expect(judge({ body: tick(body), editor: ben }, NEXT)).toEqual({ state: 'stale' });
  });
});

describe('planApproval', () => {
  const FAILURE = {
    state: 'failure',
    description: `${APPROVER} ticks the box in the enforcement comment for this commit`,
  };
  const body = signoffComment({ head: HEAD, problems: PROBLEMS });

  it('plans no comment and a green status when nothing loosens enforcement', () => {
    expect(planApproval({ head: HEAD, problems: [], comment: undefined })).toEqual({
      commentBody: null,
      refusal: null,
      status: { state: 'success', description: 'Nothing in this PR loosens enforcement' },
    });
  });

  it('clears an existing comment to a body without a checkbox when nothing loosens enforcement', () => {
    const plan = planApproval({ head: HEAD, problems: [], comment: { body, editor: null } });
    expect(plan.commentBody?.startsWith(COMMENT_MARKER)).toBe(true);
    expect(plan.commentBody).not.toContain('[ ]');
    expect(plan.status.state).toBe('success');
  });

  it('asks for sign-off when the comment is missing', () => {
    expect(planApproval({ head: HEAD, problems: PROBLEMS, comment: undefined })).toEqual({
      commentBody: body,
      refusal: null,
      status: FAILURE,
    });
  });

  it('rewrites a tick for an earlier head unticked for the new head', () => {
    const plan = planApproval({
      head: NEXT,
      problems: PROBLEMS,
      comment: { body: tick(body), editor: ben },
    });
    expect(plan.commentBody).toBe(signoffComment({ head: NEXT, problems: PROBLEMS }));
    expect(plan.status).toEqual(FAILURE);
  });

  it('clears a refused tick and names the editor in the refusal note', () => {
    const plan = planApproval({
      head: HEAD,
      problems: PROBLEMS,
      comment: { body: tick(body), editor: { login: 'dependabot[bot]', type: 'Bot' } },
    });
    expect(plan.commentBody).toBe(body);
    expect(plan.refusal).toContain('`dependabot[bot]`');
    expect(plan.refusal).toContain(`${APPROVER}, signed in to GitHub as a user`);
    expect(plan.status).toEqual(FAILURE);
  });

  it('keeps an approved comment as it is and turns green', () => {
    expect(
      planApproval({ head: HEAD, problems: PROBLEMS, comment: { body: tick(body), editor: ben } }),
    ).toEqual({
      commentBody: tick(body),
      refusal: null,
      status: { state: 'success', description: `${APPROVER} signed off at aaaaaaa` },
    });
  });

  it('keeps every status description inside the 140-character limit', () => {
    const plans = [
      planApproval({ head: HEAD, problems: [], comment: undefined }),
      planApproval({ head: HEAD, problems: PROBLEMS, comment: undefined }),
      planApproval({ head: HEAD, problems: PROBLEMS, comment: { body: tick(body), editor: ben } }),
    ];
    for (const plan of plans) expect(plan.status.description.length).toBeLessThan(140);
  });
});

interface Comment {
  id: number;
  node_id: string;
  body: string;
  user: { login: string };
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
  const state = {
    head: HEAD,
    editors: {} as Record<string, { __typename: string; login: string }>,
  };
  const calls = {
    createComment: [] as string[],
    updateComment: 0,
    createCommitStatus: [] as Record<string, unknown>[],
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
        state.editors[`node-${id}`] = { __typename: 'Bot', login: 'github-actions' };
        return { data: {} };
      },
      updateComment: async ({ comment_id, body }: { comment_id: number; body: string }) => {
        calls.updateComment += 1;
        const comment = comments.find((entry) => entry.id === comment_id);
        if (comment) {
          comment.body = body;
          state.editors[comment.node_id] = { __typename: 'Bot', login: 'github-actions' };
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
      createCommitStatus: async (parameters: Record<string, unknown>) => {
        calls.createCommitStatus.push(parameters);
        return { data: {} };
      },
    },
  };
  const github = {
    rest,
    paginate: async (
      method: (parameters: unknown) => Promise<{ data: unknown[] }>,
      parameters: unknown,
    ) => (await method(parameters)).data,
    graphql: async (_query: string, { id }: { id: string }) => ({
      node: { editor: state.editors[id] ?? null },
    }),
  };
  const editBy = (editor: Editor, edit: (body: string) => string) => {
    const comment = comments[0];
    if (!comment) throw new Error('no comment to edit');
    comment.body = edit(comment.body);
    state.editors[comment.node_id] = { __typename: editor.type, login: editor.login };
  };
  return { github, comments, calls, state, editBy };
}

const repo = { owner: 'o', repo: 'r' };
const core = { info: () => undefined };
const pullRequestContext = {
  eventName: 'pull_request_target',
  repo,
  payload: { pull_request: { number: 7 } },
};
const commentContext = { eventName: 'issue_comment', repo, payload: { issue: { number: 7 } } };

describe('run', () => {
  const loosening = () => ({
    files: [{ filename: '.husky/pre-commit' }],
    contents: {
      [MERGE_BASE]: { '.husky/pre-commit': 'npx lint-staged' },
      [HEAD]: { '.husky/pre-commit': 'true' },
      [NEXT]: { '.husky/pre-commit': 'exit 0' },
    },
  });

  it('posts one sign-off comment and a red status on the head, then stays idle on a rerun', async () => {
    const { github, comments, calls } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    expect(comments.map((comment) => comment.body)).toEqual([
      signoffComment({
        head: HEAD,
        problems: [
          { path: '.husky/pre-commit', area: 'Git hooks', reason: 'edits enforcement code' },
        ],
      }),
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

  it('turns green on a tick by the approver without editing the comment', async () => {
    const { github, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    editBy(ben, (body) => tick(body));
    await run({ github, context: commentContext, core });
    expect(calls.createCommitStatus.at(-1)).toEqual(
      expect.objectContaining({ sha: HEAD, state: 'success' }),
    );
    expect(calls.updateComment).toBe(0);
    expect(calls.createComment).toHaveLength(1);
  });

  it('accepts the trailing newline a GitHub checkbox click appends', async () => {
    const { github, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    editBy(ben, (body) => `${tick(body)}\n`);
    await run({ github, context: commentContext, core });
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'success' }));
    expect(calls.updateComment).toBe(0);
  });

  it('clears a tick by anyone else, posts a refusal note, and keeps the status red', async () => {
    const { github, comments, calls, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    const unticked = comments[0]?.body;
    editBy({ login: APPROVER, type: 'Bot' }, (body) => tick(body));
    await run({ github, context: commentContext, core });
    expect(comments[0]?.body).toBe(unticked);
    expect(comments.at(-1)?.body).toContain(`\`${APPROVER}\``);
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'failure' }));
  });

  it('clears an approval when a new commit becomes the head', async () => {
    const { github, comments, calls, state, editBy } = fakeGitHub(loosening());
    await run({ github, context: pullRequestContext, core });
    editBy(ben, (body) => tick(body));
    state.head = NEXT;
    await run({ github, context: pullRequestContext, core });
    expect(comments[0]?.body).toContain(`- [ ] Approve these enforcement changes at \`${NEXT}\``);
    expect(calls.createCommitStatus.at(-1)).toEqual(
      expect.objectContaining({ sha: NEXT, state: 'failure' }),
    );
  });

  it('ignores a ticked lookalike comment that a person posted', async () => {
    const problems = [
      { path: '.husky/pre-commit', area: 'Git hooks', reason: 'edits enforcement code' },
    ];
    const forged = tick(signoffComment({ head: HEAD, problems }));
    const fake = fakeGitHub({
      ...loosening(),
      comments: [{ id: 1, node_id: 'node-1', body: forged, user: { login: APPROVER } }],
    });
    fake.state.editors['node-1'] = { __typename: 'User', login: APPROVER };
    await run({ github: fake.github, context: pullRequestContext, core });
    expect(fake.calls.createComment).toHaveLength(1);
    expect(fake.calls.createCommitStatus).toEqual([expect.objectContaining({ state: 'failure' })]);
  });

  it('sets a green status and posts nothing when nothing loosens enforcement', async () => {
    const { github, calls } = fakeGitHub({
      files: [{ filename: 'src/App.tsx' }, { filename: 'docs/required-gates.md' }],
      contents: {
        [MERGE_BASE]: { 'docs/required-gates.md': '- typecheck\n' },
        [HEAD]: { 'docs/required-gates.md': '- typecheck\n- e2e\n' },
      },
    });
    await run({ github, context: pullRequestContext, core });
    expect(calls.createComment).toEqual([]);
    expect(calls.createCommitStatus).toEqual([
      expect.objectContaining({ sha: HEAD, state: 'success' }),
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

  it('lets every edit of the gate comment reach the script, whoever made it', () => {
    expect(workflow).not.toContain('sender.type');
    expect(workflow).toContain(`github.event.comment.user.login == '${GATE_AUTHOR}'`);
    expect(workflow).toContain(`startsWith(github.event.comment.body, '${COMMENT_MARKER}')`);
  });
});
