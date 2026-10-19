/**
 * @jest-environment node
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/require-up-to-date-main.sh');
const REMEDY = 'git fetch origin && git merge origin/main';

const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

let root: string;
let work: string;
let other: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
}

function commit(cwd: string, file: string): void {
  writeFileSync(join(cwd, file), file);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', file);
}

function check(...flags: string[]) {
  const result = spawnSync('sh', [SCRIPT, ...flags], { cwd: work, env, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}

/** Push from `work` through a real pre-push hook that runs only the up-to-date gate. */
function push(...args: string[]) {
  const hook = join(work, '.git/hooks/pre-push');
  writeFileSync(hook, `#!/bin/sh\nexec sh '${SCRIPT}' --pushed-refs\n`);
  chmodSync(hook, 0o755);
  const result = spawnSync('git', ['push', '-q', 'origin', ...args], {
    cwd: work,
    env,
    encoding: 'utf8',
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

const remoteBranches = () => git(work, 'ls-remote', '--heads', 'origin');

/** Advance origin/main from a second clone, so `work` only learns of it by fetching. */
function advanceRemoteMain(): void {
  commit(other, `main-${Date.now()}-${Math.random()}`);
  git(other, 'push', '-q', 'origin', 'main');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'up-to-date-main-'));
  const origin = join(root, 'origin.git');
  work = join(root, 'work');
  other = join(root, 'other');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  commit(work, 'base');
  git(work, 'push', '-q', 'origin', 'main');
  git(root, 'clone', '-q', origin, other);
  git(work, 'switch', '-q', '-c', 'feature');
  commit(work, 'feature-work');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('require-up-to-date-main.sh', () => {
  it('passes a branch that already contains origin/main', () => {
    expect(check()).toMatchObject({ status: 0 });
  });

  it('passes the first push of a new branch that has no upstream', () => {
    expect(git(work, 'for-each-ref', '--format=%(upstream)', 'refs/heads/feature')).toBe('');
    expect(check()).toMatchObject({ status: 0 });
  });

  it('fetches origin/main and refuses a branch that is behind it, naming the merge remedy', () => {
    advanceRemoteMain();
    const { status, output } = check();
    expect(status).toBe(1);
    expect(output).toContain(REMEDY);
    expect(output).not.toMatch(/rebase/i);
  });

  it('passes again once the suggested merge has been run', () => {
    advanceRemoteMain();
    expect(check().status).toBe(1);
    execFileSync('sh', ['-c', `${REMEDY} -q --no-edit`], { cwd: work, env });
    expect(check()).toMatchObject({ status: 0 });
  });

  it('passes the commit that concludes a conflicted merge of origin/main', () => {
    writeFileSync(join(work, 'base'), 'feature edit');
    git(work, 'commit', '-q', '-am', 'feature edits base');
    writeFileSync(join(other, 'base'), 'main edit');
    git(other, 'commit', '-q', '-am', 'main edits base');
    git(other, 'push', '-q', 'origin', 'main');
    const merge = spawnSync('sh', ['-c', REMEDY], { cwd: work, env, encoding: 'utf8' });
    expect(merge.status).not.toBe(0);
    writeFileSync(join(work, 'base'), 'resolved');
    git(work, 'add', 'base');
    expect(check()).toMatchObject({ status: 0 });
  });

  it('allows commits on main itself even when local main is behind', () => {
    git(work, 'switch', '-q', 'main');
    advanceRemoteMain();
    expect(check()).toMatchObject({ status: 0 });
  });

  it('checks a detached HEAD against origin/main', () => {
    git(work, 'switch', '-q', '--detach');
    expect(check().status).toBe(0);
    advanceRemoteMain();
    const { status, output } = check();
    expect(status).toBe(1);
    expect(output).toContain(REMEDY);
  });

  describe('when origin cannot be fetched', () => {
    beforeEach(() => {
      git(work, 'remote', 'set-url', 'origin', join(root, 'missing.git'));
    });

    it('fails closed by default (pre-push and CI)', () => {
      const { status, output } = check();
      expect(status).toBe(1);
      expect(output).toMatch(/could not fetch origin\/main/i);
    });

    it('gives up on a hanging fetch after the timeout', () => {
      git(work, 'remote', 'set-url', 'origin', 'ssh://example.invalid/repo.git');
      const started = Date.now();
      const result = spawnSync('sh', [SCRIPT, '--allow-offline'], {
        cwd: work,
        env: {
          ...env,
          GIT_SSH_COMMAND: 'sleep 30 #',
          UP_TO_DATE_FETCH_TIMEOUT: '1',
        },
        encoding: 'utf8',
      });
      expect(Date.now() - started).toBeLessThan(5000);
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/could not fetch origin\/main/i);
    });

    it('with --allow-offline, warns and passes against the last known origin/main', () => {
      const { status, output } = check('--allow-offline');
      expect(status).toBe(0);
      expect(output).toMatch(/could not fetch origin\/main/i);
    });

    it('with --allow-offline, still refuses a branch behind the last known origin/main', () => {
      git(work, 'switch', '-q', 'main');
      commit(work, 'local-main-advance');
      git(work, 'update-ref', 'refs/remotes/origin/main', 'main');
      git(work, 'switch', '-q', 'feature');
      const { status, output } = check('--allow-offline');
      expect(status).toBe(1);
      expect(output).toContain(REMEDY);
    });
  });
});

describe('require-up-to-date-main.sh --pushed-refs (pre-push)', () => {
  it('refuses a stale branch pushed while main is checked out, naming it', () => {
    advanceRemoteMain();
    git(work, 'switch', '-q', 'main');
    const { status, output } = push('feature');
    expect(status).not.toBe(0);
    expect(output).toMatch(/✗ feature is behind origin\/main/);
    expect(output).toContain(REMEDY);
    expect(remoteBranches()).not.toContain('refs/heads/feature');
  });

  it('passes several pushed branches that all contain origin/main', () => {
    git(work, 'branch', 'feature-two');
    git(work, 'switch', '-q', 'main');
    expect(push('feature', 'feature-two')).toMatchObject({ status: 0 });
    expect(remoteBranches()).toContain('refs/heads/feature-two');
  });

  it('refuses the one stale branch among several, naming only it', () => {
    advanceRemoteMain();
    git(work, 'switch', '-q', '-c', 'fresh');
    execFileSync('sh', ['-c', `${REMEDY} -q --no-edit`], { cwd: work, env });
    const { status, output } = push('fresh', 'feature');
    expect(status).not.toBe(0);
    expect(output).toMatch(/✗ feature is behind origin\/main/);
    expect(output).not.toMatch(/fresh is behind/);
    expect(remoteBranches()).not.toContain('refs/heads/fresh');
  });

  it('allows deleting a stale remote branch', () => {
    expect(push('feature')).toMatchObject({ status: 0 });
    advanceRemoteMain();
    expect(push('--delete', 'feature')).toMatchObject({ status: 0 });
    expect(remoteBranches()).not.toContain('refs/heads/feature');
  });

  it('allows pushing main while a stale branch is checked out', () => {
    advanceRemoteMain();
    git(work, 'switch', '-q', 'main');
    git(work, 'pull', '-q', '--ff-only');
    commit(work, 'main-fix');
    git(work, 'switch', '-q', 'feature');
    expect(check().status).toBe(1);
    expect(push('main')).toMatchObject({ status: 0 });
    expect(git(work, 'ls-remote', 'origin', 'refs/heads/main')).toContain(
      git(work, 'rev-parse', 'main'),
    );
  });

  it('allows pushing a tag on an older commit', () => {
    git(work, 'tag', '-a', '-m', 'release', 'v1', 'main');
    advanceRemoteMain();
    expect(push('v1')).toMatchObject({ status: 0 });
    expect(git(work, 'ls-remote', 'origin', 'refs/tags/v1')).not.toBe('');
  });
});

describe('gate wiring', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  it('runs the check first in both hooks: offline-tolerant on HEAD at commit, strict on pushed refs at push', () => {
    const preCommit = read('.husky/pre-commit');
    const prePush = read('.husky/pre-push');
    expect(preCommit).toContain('sh scripts/require-up-to-date-main.sh --allow-offline');
    expect(preCommit.indexOf('require-up-to-date-main.sh')).toBeLessThan(
      preCommit.indexOf('pnpm typecheck'),
    );
    expect(prePush).toMatch(/sh scripts\/require-up-to-date-main\.sh --pushed-refs\n/);
    expect(prePush.indexOf('require-up-to-date-main.sh')).toBeLessThan(prePush.indexOf('pnpm '));
  });

  it('runs the full local gate suite before the behaviour map at push, since a clean merge skips pre-commit', () => {
    const prePush = read('.husky/pre-push');
    const verify = prePush.search(/^pnpm verify$/m);
    const e2e = prePush.search(/^pnpm e2e$/m);
    expect(verify).toBeGreaterThan(-1);
    expect(e2e).toBeGreaterThan(verify);
    expect(prePush.search(/^unset \$\(git rev-parse --local-env-vars\)$/m)).toBeLessThan(verify);
  });

  it('runs the strict check in CI against the PR head commit, not the merge commit', () => {
    const ci = read('.github/workflows/ci.yml');
    const headSha = '$' + '{{ github.event.pull_request.head.sha }}';
    expect(ci).toContain(`ref: ${headSha}`);
    expect(ci).toContain('fetch-depth: 0');
    expect(ci).toMatch(/run: sh scripts\/require-up-to-date-main\.sh\n/);
  });
});
