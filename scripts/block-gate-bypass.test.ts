import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = resolve(
  fileURLToPath(new URL('..', import.meta.url)),
  '.claude/hooks/block-gate-bypass.sh',
);

/** Pipe a Bash command into the hook as Claude Code's PreToolUse JSON. */
function runHook(command: string) {
  const result = spawnSync('sh', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr };
}

const BLOCKED = [
  'git commit --no-verify -m "x"',
  'git push --no-verify',
  'git commit --no-veri -m x',
  'git commit -n -m x',
  'git commit -nm x',
  'git commit -anm x',
  'git commit --amend -n',
  'git commit -m "x" -n',
  'git commit -m "$(git commit -n -m y)"',
  'git -C apps/web commit -n -m x',
  'git commit\n-n -m x',
  'cd apps && git commit -n -m x',
  'HUSKY=0 git commit -m x',
  'HUSKY=0 git push',
  'HUSKY="0" git push',
  "HUSKY='0' git push",
  'export HUSKY=0; git push',
  'env HUSKY=0 git push',
  'git -c core.hooksPath=/dev/null commit -m x',
  'git -c core.hookspath=/dev/null push',
  'git --config-env core.hooksPath=EMPTY push',
  'git config core.hooksPath /dev/null',
  'git config "core.hooksPath" /dev/null',
  'git config --global core.hooksPath /tmp/none',
  'git config --unset core.hooksPath',
  'git config core.hooksPath .husky-off',
  'git config --get core.hooksPath && git config core.hooksPath /dev/null',
  "GIT_CONFIG_PARAMETERS=\"'core.hooksPath'='/dev/null'\" git push",
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/x git push',
  "bash -c 'git push --no-verify'",
  'sh -c "git commit -n -m x"',
  "bash -c 'HUSKY=0 git push'",
];

const ALLOWED = [
  'git status',
  'git commit -m "feat: add thing"',
  'git commit -m "docs: explain -n"',
  "git commit -m 'docs: explain -nm'",
  'git commit --message="docs: -n flag"',
  'git commit -mn',
  'git commit -uno -m x',
  'git commit --no-edit --amend',
  'git commit -F msg.txt',
  'git push',
  'git push -n',
  'git push origin HEAD',
  'git config --get core.hooksPath',
  'git config core.hooksPath',
  'git config core.hooksPath .husky',
  'git config core.hooksPath .husky/_',
  'git config --local core.hooksPath .husky/_ && git push',
  'git log --oneline -n 5',
  'HUSKY=1 git push',
];

describe('block-gate-bypass hook', () => {
  it.each(BLOCKED)('blocks %j', (command) => {
    const { status, stderr } = runHook(command);
    expect(status).toBe(2);
    expect(stderr).toContain('Fix what the gate reports instead');
    expect(stderr).toContain('.agents/project/DEFINITION_OF_DONE.md');
  });

  it.each(ALLOWED)('allows %j', (command) => {
    expect(runHook(command).status).toBe(0);
  });
});
