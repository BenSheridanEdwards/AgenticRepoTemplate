import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOOK = resolve(ROOT, '.agents/hooks/block-gate-bypass.sh');
const HOOK_ARG = `\${CLAUDE_PROJECT_DIR}/.agents/hooks/block-gate-bypass.sh`;

/** Pipe a Bash command into the hook as Claude Code's PreToolUse JSON. */
function runHook(shell: string, command: string, description = 'Run a git command') {
  const payload = {
    session_id: 'test-session',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: ROOT,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command, description },
  };
  const result = spawnSync(shell, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

const BLOCKED = [
  'git commit --no-verify -m "x"',
  'git push --no-verify',
  'git commit --no-veri -m x',
  "git push --no-ver''ify",
  'git push --no-\\verify',
  'git commit -n -m x',
  'git commit -nm x',
  'git commit -anm x',
  'git commit --amend -n',
  'git commit -m "x" -n',
  'git commit "-n" -m x',
  'git commit -m x "-n"',
  'git commit -m "$(git commit -n -m y)"',
  'git -C apps/web commit -n -m x',
  'git commit\n-n -m x',
  'cd apps && git commit -n -m x',
  // A fake -m inside another quoted string must not hide what follows it.
  "git push 'x -m ' --no-verify ' y'",
  'HUSKY=0 git commit -m x',
  'HUSKY=0 git push',
  'HUSKY="0" git push',
  "HUSKY='0' git push",
  "HUSKY=''0 git push",
  'HU""SKY=0 git push',
  'HUSKY=\\0 git push',
  'HUSKY=$(echo 0) git push',
  `HUSKY=\${X:-0} git push`,
  'HUSKY=`echo 0` git push',
  'export HUSKY=0; git push',
  'env HUSKY=0 git push',
  'git -c core.hooksPath=/dev/null commit -m x',
  'git -c core.hookspath=/dev/null push',
  "git -c core.hooks''Path=/dev/null push",
  'git --config-env core.hooksPath=EMPTY push',
  'git config core.hooksPath /dev/null',
  'git config "core.hooksPath" /dev/null',
  'git config core.hooks\\Path /dev/null',
  'git config --global core.hooksPath /tmp/none',
  'git config --unset core.hooksPath',
  'git config core.hooksPath .husky-off',
  'git config --get core.hooksPath && git config core.hooksPath /dev/null',
  "GIT_CONFIG_PARAMETERS=\"'core.hooksPath'='/dev/null'\" git push",
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/x git push',
  "git config alias.ci 'commit -n'",
  'git config --global alias.p "push --no-verify"',
  "git -c alias.ci='commit -n' ci -m x",
  'git config include.path /tmp/evil.gitconfig',
  'git config includeIf.gitdir:~/.path /tmp/evil.gitconfig',
  'git -c include.path=/tmp/evil.gitconfig commit -m x',
  "bash -c 'git push --no-verify'",
  'sh -c "git commit -n -m x"',
  "bash -c 'HUSKY=0 git push'",
];

const ALLOWED = [
  'git status',
  'git commit -m "feat: add thing"',
  'git commit -m "fix: y"',
  'git commit -m "docs: explain -n"',
  "git commit -m 'docs: explain -nm'",
  'git commit -m "docs: mention --no-verify and HUSKY=0"',
  'git commit --message="docs: -n flag"',
  'git commit -m "$(cat <<\'EOF\'\nfix: y\n\nLonger body.\nEOF\n)"',
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
  'git config --get alias.ci',
  "git config --get-regexp '^alias\\.'",
  'git config --list',
  'git config --get include.path',
  'git log --oneline -n 5',
  'HUSKY=1 git push',
];

// The description is free text from the agent; only the command is matched.
const ALLOWED_WITH_BYPASS_DESCRIPTIONS: [string, string][] = [
  ['git config --get core.hooksPath', 'Read core.hooksPath'],
  ['git commit -m "fix: y"', 'Commit -n changes without --no-verify'],
  ['git push', 'Push without HUSKY=0'],
  ['git status', 'Check whether alias.ci or include.path is set'],
];

describe.each(['sh', 'bash'])('block-gate-bypass hook under %s', (shell) => {
  it.each(BLOCKED)('blocks %j', (command) => {
    const { status, stderr } = runHook(shell, command);
    expect(status).toBe(2);
    expect(stderr).toContain('Fix what the gate reports instead');
    expect(stderr).toContain('.agents/project/PR_QUALITY.md#definition-of-done');
  });

  it.each(ALLOWED)('allows %j', (command) => {
    expect(runHook(shell, command)).toEqual({ status: 0, stderr: '' });
  });

  it.each(ALLOWED_WITH_BYPASS_DESCRIPTIONS)('allows %j described as %j', (command, description) => {
    expect(runHook(shell, command, description)).toEqual({ status: 0, stderr: '' });
  });

  it('blocks when the payload is not JSON', () => {
    const result = spawnSync(shell, [HOOK], { input: 'not json', encoding: 'utf8' });
    expect(result.status).toBe(2);
  });
});

/**
 * Run the `.codex/hooks.json` PreToolUse command as Codex does: its `command`
 * string through a shell, from `cwd`, with Codex's PreToolUse JSON on stdin.
 * The command resolves the script from the repository root (`git rev-parse
 * --show-toplevel`), so it finds it from a subfolder too.
 */
function runCodexHook(command: string, cwd: string) {
  const hooks = JSON.parse(readFileSync(resolve(ROOT, '.codex/hooks.json'), 'utf8'));
  const [entry] = hooks.hooks.PreToolUse;
  const payload = {
    session_id: 'test-session',
    turn_id: 'test-turn',
    transcript_path: '/tmp/rollout.jsonl',
    cwd,
    hook_event_name: 'PreToolUse',
    model: 'gpt-6.1-sol',
    permission_mode: 'bypassPermissions',
    tool_name: 'Bash',
    tool_input: { command },
    tool_use_id: 'exec-1',
  };
  const result = spawnSync('sh', ['-c', entry.hooks[0].command], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr };
}

describe('.codex/hooks.json', () => {
  it('runs the same script for ^Bash$ through git rev-parse', () => {
    const hooks = JSON.parse(readFileSync(resolve(ROOT, '.codex/hooks.json'), 'utf8'));
    const pre = hooks.hooks.PreToolUse;

    expect(pre).toHaveLength(1);
    expect(pre[0].matcher).toBe('^Bash$');
    expect(pre[0].hooks).toHaveLength(1);
    expect(pre[0].hooks[0].type).toBe('command');
    expect(pre[0].hooks[0].command).toContain('git rev-parse --show-toplevel');
    expect(pre[0].hooks[0].command).toContain('.agents/hooks/block-gate-bypass.sh');
  });

  it.each([
    ROOT,
    resolve(ROOT, 'tooling/trial'),
  ])('blocks git commit --no-verify and allows normal commits and git status, run from %s', (cwd) => {
    const blocked = runCodexHook('git commit --no-verify --allow-empty -m probe', cwd);
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain('Fix what the gate reports instead');

    expect(runCodexHook('git commit -m "fix: probe"', cwd)).toEqual({ status: 0, stderr: '' });
    expect(runCodexHook('git status', cwd)).toEqual({ status: 0, stderr: '' });
  });
});

describe('.claude/settings.json', () => {
  it('resolves the git hook, refuses bypasses, and allows normal commits', () => {
    const settings = JSON.parse(readFileSync(resolve(ROOT, '.claude/settings.json'), 'utf8'));

    const hook = settings.hooks.PreToolUse.flatMap(
      (entry: { hooks: { if: string; args: string[] }[] }) => entry.hooks,
    ).find((entry: { if: string }) => entry.if === 'Bash(git *)');

    const hookPath = hook.args[0].replace(`\${CLAUDE_PROJECT_DIR}`, ROOT);
    expect(existsSync(hookPath)).toBe(true);

    const run = (command: string) =>
      spawnSync('sh', [hookPath], {
        input: JSON.stringify({
          session_id: 'test-session',
          transcript_path: '/tmp/transcript.jsonl',
          cwd: ROOT,
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: { command },
        }),
        encoding: 'utf8',
      });

    const blocked = run('git commit --no-verify -m "probe"');
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain('switches off the quality gates');
    const allowed = run('git commit -m "fix: probe"');
    expect(allowed.status).toBe(0);
    expect(allowed.stderr).toBe('');
  });

  it('spawns the hook for git, env, sh, and bash commands', () => {
    const settings = JSON.parse(readFileSync(resolve(ROOT, '.claude/settings.json'), 'utf8'));
    const bashEntries = settings.hooks.PreToolUse.filter(
      (entry: { matcher: string }) => entry.matcher === 'Bash',
    );
    const hooks = bashEntries.flatMap((entry: { hooks: unknown[] }) => entry.hooks);

    expect(hooks.map((hook: { if: string }) => hook.if).sort()).toEqual(
      ['Bash(bash *)', 'Bash(env *)', 'Bash(git *)', 'Bash(sh *)'].sort(),
    );
    [...hooks].forEach((hook) => {
      expect(hook).toMatchObject({ type: 'command', command: 'sh', args: [HOOK_ARG] });
    });
  });
});
