/**
 * @jest-environment node
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/require-up-to-date-main.sh');
const REMEDY = 'git fetch origin && git merge origin/main';

// Hooks export GIT_DIR/GIT_INDEX_FILE etc.; they must not leak into the scratch
// repos when this suite runs from pre-push.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);
Object.assign(env, {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
});

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

describe('gate wiring', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  it('runs the check first in both hooks: offline-tolerant on commit, strict on push', () => {
    const preCommit = read('.husky/pre-commit');
    const prePush = read('.husky/pre-push');
    expect(preCommit).toContain('sh scripts/require-up-to-date-main.sh --allow-offline');
    expect(preCommit.indexOf('require-up-to-date-main.sh')).toBeLessThan(
      preCommit.indexOf('pnpm typecheck'),
    );
    expect(prePush).toMatch(/sh scripts\/require-up-to-date-main\.sh\n/);
    expect(prePush.indexOf('require-up-to-date-main.sh')).toBeLessThan(prePush.indexOf('pnpm '));
  });
});
