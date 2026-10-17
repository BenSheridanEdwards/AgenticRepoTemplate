import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMMENT_MARKER,
  classifyProtectedFiles,
  fingerprint,
  GATE_AUTHOR,
  PROTECTED_PATH_RULES,
  planApproval,
  run,
  STATUS_CONTEXT,
} from './enforcement-approval.mjs';

interface PullRequestFile {
  filename: string;
  status: string;
  sha: string;
  previous_filename?: string;
  additions: number;
  deletions: number;
}

function file(filename: string, overrides: Partial<PullRequestFile> = {}): PullRequestFile {
  return {
    filename,
    status: 'modified',
    sha: `sha-${filename}`,
    additions: 1,
    deletions: 0,
    ...overrides,
  };
}

const UNTICKED = '- [ ] **Approve these enforcement changes**';
const TICKED = '- [x] **Approve these enforcement changes**';

function tick(body: string) {
  return body.replace(UNTICKED, TICKED);
}

describe('classifyProtectedFiles', () => {
  it('checks the protected areas in a fixed order, first match wins', () => {
    expect(PROTECTED_PATH_RULES.map((rule: { area: string }) => rule.area)).toEqual([
      'Agent docs',
      'GitHub config and workflows',
      'Claude Code settings and skills',
      'Git hooks',
      'Scripts',
      'Tooling',
      'Root config',
    ]);
  });

  it.each([
    ['AGENTS.md', 'Agent docs'],
    ['CLAUDE.md', 'Agent docs'],
    ['GUARDRAILS.md', 'Agent docs'],
    ['.agents/project/QUALITY_GATES.md', 'Agent docs'],
    ['agents/openai.yaml', 'Agent docs'],
    ['.github/workflows/ci.yml', 'GitHub config and workflows'],
    ['.claude/settings.json', 'Claude Code settings and skills'],
    ['.husky/pre-commit', 'Git hooks'],
    ['scripts/verify-gates.sh', 'Scripts'],
    ['tooling/anything.json', 'Tooling'],
    ['tsconfig.json', 'Root config'],
    ['.fallowrc.jsonc', 'Root config'],
  ])('flags %s as %s', (path, area) => {
    expect(classifyProtectedFiles([file(path)])).toEqual([
      {
        path,
        previousPath: undefined,
        status: 'modified',
        sha: `sha-${path}`,
        area,
        additions: 1,
        deletions: 0,
      },
    ]);
  });

  it.each([
    'src/App.tsx',
    'e2e/app.spec.ts',
    'README.md',
    'docs/proof/README.md',
    'index.html',
    'package.json',
    'pnpm-lock.yaml',
  ])('leaves %s unflagged', (path) => {
    expect(classifyProtectedFiles([file(path)])).toEqual([]);
  });

  it('flags a file moved out of a protected area', () => {
    const moved = file('src/x.ts', { status: 'renamed', previous_filename: 'scripts/x.mjs' });
    expect(classifyProtectedFiles([moved])).toEqual([
      {
        path: 'src/x.ts',
        previousPath: 'scripts/x.mjs',
        status: 'renamed',
        sha: 'sha-src/x.ts',
        area: 'Scripts',
        additions: 1,
        deletions: 0,
      },
    ]);
  });

  it('returns protected files sorted by path', () => {
    const paths = classifyProtectedFiles([
      file('scripts/b.mjs'),
      file('src/a.ts'),
      file('.github/a.yml'),
    ]).map((entry: { path: string }) => entry.path);
    expect(paths).toEqual(['.github/a.yml', 'scripts/b.mjs']);
  });
});

describe('fingerprint', () => {
  it('changes when a protected file changes content and holds when only unprotected files change', () => {
    const base = classifyProtectedFiles([file('scripts/a.mjs'), file('src/a.ts')]);
    const sameProtected = classifyProtectedFiles([
      file('scripts/a.mjs'),
      file('src/a.ts', { sha: 'other' }),
    ]);
    expect(fingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(sameProtected)).toBe(fingerprint(base));
  });
});

describe('planApproval', () => {
  const protectedFiles = [file('scripts/a.mjs', { additions: 4, deletions: 2 }), file('src/a.ts')];

  it('plans no comment and a green status when no enforcement path changes', () => {
    const plan = planApproval({ files: [file('src/a.ts')] });
    expect(plan.commentBody).toBeNull();
    expect(plan.status).toEqual({
      state: 'success',
      description: 'No enforcement paths change in this PR',
    });
  });

  it('rewrites an existing comment without a checkbox once the PR changes only unprotected paths', () => {
    const existingBody = planApproval({ files: protectedFiles }).commentBody ?? '';
    const plan = planApproval({ files: [file('src/a.ts')], existingBody });
    expect(plan.commentBody).toContain(COMMENT_MARKER);
    expect(plan.commentBody).toContain('only unprotected paths');
    expect(plan.commentBody).not.toContain('[ ]');
    expect(plan.status.state).toBe('success');
  });

  it('asks for sign-off with one unticked box and a red status when enforcement paths change', () => {
    const plan = planApproval({ files: protectedFiles });
    const body = plan.commentBody ?? '';
    expect(body).toContain(COMMENT_MARKER);
    expect(body).toMatch(/<!-- enforcement-fingerprint:[0-9a-f]{64} -->/);
    expect(body).toContain('| `scripts/a.mjs` | modified | +4 / -2 | Scripts |');
    expect(body).not.toContain('src/a.ts');
    expect(
      body.split('\n').filter((line) => line.includes('Approve these enforcement changes')),
    ).toEqual([UNTICKED]);
    expect(plan.status).toEqual({
      state: 'failure',
      description: 'Tick the approval box in the enforcement comment',
    });
  });

  it.each([
    '[x]',
    '[X]',
  ])('keeps a %s tick and turns green when the fingerprint is unchanged', (box) => {
    const existingBody = (planApproval({ files: protectedFiles }).commentBody ?? '').replace(
      '[ ]',
      box,
    );
    const plan = planApproval({ files: protectedFiles, existingBody });
    expect(plan.commentBody).toContain(TICKED);
    expect(plan.status).toEqual({
      state: 'success',
      description: 'Approved in the enforcement comment',
    });
  });

  it('resets the tick and turns red when a protected file changes after approval', () => {
    const existingBody = tick(planApproval({ files: protectedFiles }).commentBody ?? '');
    const changed = [file('scripts/a.mjs', { sha: 'new' }), file('src/a.ts')];
    const plan = planApproval({ files: changed, existingBody });
    expect(plan.commentBody).toContain(UNTICKED);
    expect(plan.status.state).toBe('failure');
  });

  it('keeps the tick when only an unprotected file changes after approval', () => {
    const existingBody = tick(planApproval({ files: protectedFiles }).commentBody ?? '');
    const changed = [
      file('scripts/a.mjs', { additions: 4, deletions: 2 }),
      file('src/a.ts', { sha: 'new' }),
    ];
    const plan = planApproval({ files: changed, existingBody });
    expect(plan.commentBody).toBe(existingBody);
    expect(plan.status.state).toBe('success');
  });

  it('keeps every status description inside the 140-character limit', () => {
    const descriptions = [
      planApproval({ files: [] }),
      planApproval({ files: protectedFiles }),
      planApproval({ files: [], existingBody: COMMENT_MARKER }),
    ].map((plan) => plan.status.description);
    for (const description of descriptions) {
      expect(description.length).toBeLessThan(140);
    }
  });
});

interface Comment {
  id: number;
  body: string;
  user: { login: string };
}

function fakeGitHub({
  files,
  permission = 'write',
  comments = [],
}: {
  files: PullRequestFile[];
  permission?: string;
  comments?: Comment[];
}) {
  const calls = {
    createComment: 0,
    updateComment: 0,
    createCommitStatus: [] as Record<string, unknown>[],
  };
  const rest = {
    pulls: {
      get: async () => ({ data: { head: { sha: 'head-sha' } } }),
      listFiles: async () => ({ data: files }),
    },
    issues: {
      listComments: async () => ({ data: comments }),
      createComment: async ({ body }: { body: string }) => {
        calls.createComment += 1;
        comments.push({ id: comments.length + 1, body, user: { login: GATE_AUTHOR } });
        return { data: {} };
      },
      updateComment: async ({ comment_id, body }: { comment_id: number; body: string }) => {
        calls.updateComment += 1;
        const comment = comments.find((entry) => entry.id === comment_id);
        if (comment) comment.body = body;
        return { data: {} };
      },
    },
    repos: {
      getCollaboratorPermissionLevel: async () => ({ data: { permission } }),
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
  };
  return { github, comments, calls };
}

const repo = { owner: 'o', repo: 'r' };
const core = { info: () => undefined };

describe('run', () => {
  const files = [file('scripts/a.mjs')];
  const pullRequestContext = {
    eventName: 'pull_request_target',
    repo,
    payload: { pull_request: { number: 7 } },
  };

  it('posts one sticky comment and sets a red status on the head commit, then stays idle on a rerun', async () => {
    const { github, comments, calls } = fakeGitHub({ files });
    await run({ github, context: pullRequestContext, core });
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain(COMMENT_MARKER);
    expect(calls.createCommitStatus).toEqual([
      expect.objectContaining({
        ...repo,
        sha: 'head-sha',
        context: STATUS_CONTEXT,
        state: 'failure',
      }),
    ]);

    await run({ github, context: pullRequestContext, core });
    expect(calls.createComment).toBe(1);
    expect(calls.updateComment).toBe(0);
  });

  it('clears a tick from a user without write access and keeps the status red', async () => {
    const comments: Comment[] = [];
    await run({
      github: fakeGitHub({ files, comments }).github,
      context: pullRequestContext,
      core,
    });
    const sticky = comments[0];
    if (sticky) sticky.body = tick(sticky.body);

    const { github, calls } = fakeGitHub({ files, comments, permission: 'read' });
    const commentContext = {
      eventName: 'issue_comment',
      repo,
      payload: { issue: { number: 7 }, sender: { login: 'visitor' } },
    };
    await run({ github, context: commentContext, core });
    expect(calls.createCommitStatus).toEqual([expect.objectContaining({ state: 'failure' })]);
    expect(comments[0]?.body).toContain('- [ ] **Approve these enforcement changes**');
    expect(comments.at(-1)?.body).toContain('@visitor');
    expect(comments.at(-1)?.body).toContain('write access');
  });

  it('ignores a ticked lookalike comment written by anyone but the gate', async () => {
    const forged = planApproval({ files }).commentBody ?? '';
    const comments: Comment[] = [{ id: 99, body: tick(forged), user: { login: 'someone' } }];
    const { github, calls } = fakeGitHub({ files, comments });
    await run({ github, context: pullRequestContext, core });
    expect(calls.createComment).toBe(1);
    expect(calls.createCommitStatus).toEqual([expect.objectContaining({ state: 'failure' })]);
  });

  it('applies a tick from a user with write access', async () => {
    const { github, comments, calls } = fakeGitHub({ files });
    await run({ github, context: pullRequestContext, core });
    const sticky = comments[0];
    if (sticky) sticky.body = tick(sticky.body);
    const commentContext = {
      eventName: 'issue_comment',
      repo,
      payload: { issue: { number: 7 }, sender: { login: 'maintainer' } },
    };
    await run({ github, context: commentContext, core });
    expect(calls.createCommitStatus.at(-1)).toEqual(expect.objectContaining({ state: 'success' }));
    expect(calls.updateComment).toBe(0);
  });
});

describe('enforcement-approval workflow', () => {
  const readWorkflow = () =>
    readFileSync(join(process.cwd(), '.github/workflows/enforcement-approval.yml'), 'utf8');

  it('runs on pull_request_target and on edited PR comments', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('pull_request_target:');
    expect(workflow).toMatch(/issue_comment:\s*\n\s*types: \[edited\]/);
  });

  it('checks out only the default branch copy and runs no PR code', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('ref: $' + '{{ github.event.repository.default_branch }}');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toContain('pull_request.head');
    expect(workflow).not.toMatch(/^\s*(-\s+)?run:/m);
  });
});
