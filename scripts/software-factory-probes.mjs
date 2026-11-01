import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Inputs are data: none of the command strings below is executed by a shell.
const root = process.cwd();
const { enforcementProblems, signoffComment, planApproval } = await import(
  pathToFileURL(join(root, 'scripts/enforcement-approval.mjs')).href
);
const run = (command, args, options = {}) => {
  const start = performance.now();
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  assert.equal(result.error, undefined);
  return {
    command: [command, ...args],
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    elapsedSeconds: (performance.now() - start) / 1000,
  };
};
const guard = [
  ['no-verify', 'git commit --no-verify -m probe', 2],
  ['commit-n', 'git commit -n -m probe', 2],
  ['husky-zero', 'HUSKY=0 git commit -m probe', 2],
  ['legitimate-control', 'git commit -m "docs: explain gates"', 0],
].map(([name, command, expected]) => {
  const input = JSON.stringify({ tool_input: { command } });
  const result = run('sh', ['.agents/hooks/block-gate-bypass.sh'], { input });
  assert.equal(result.exitCode, expected, name);
  return { name, input, expectedExit: expected, ...result };
});
const before = "export default [{ rules: { 'policy/state-and-effects-in-hooks': 'error' } }];";
const after = "export default [{ rules: { 'policy/state-and-effects-in-hooks': 'off' } }];";
const problems = enforcementProblems([{ path: 'eslint.config.js', before, after }]);
assert.ok(problems.some((problem) => problem.area === 'Lint config'));
const control = enforcementProblems([
  { path: 'README.md', before: 'old prose', after: 'new prose' },
]);
assert.deepEqual(control, []);
const head = 'a'.repeat(40);
const nextHead = 'b'.repeat(40);
const at = '2026-10-31T12:00:00Z';
const unticked = signoffComment({ head, problems });
const ticked = unticked.replace('\n- [ ] ', '\n- [x] ');
const event = {
  kind: 'comment',
  from: unticked,
  to: ticked,
  at,
  sender: { login: 'BenSheridanEdwards', type: 'User', name: 'Synthetic fixture' },
};
const approve = (sender) =>
  planApproval({
    head,
    problems,
    comment: { body: ticked, updatedAt: at },
    signedOff: false,
    event: { ...event, sender },
  });
const namedUser = approve(event.sender);
const wrongUser = approve({ login: 'another-user', type: 'User' });
assert.equal(namedUser.status.state, 'success');
assert.equal(wrongUser.status.state, 'failure');
const newHead = planApproval({
  head: nextHead,
  problems,
  comment: { body: namedUser.commentBody },
  signedOff: false,
  event: { kind: 'pull' },
});
assert.equal(newHead.status.state, 'failure');
assert.ok(newHead.commentBody.includes(nextHead));
const directory = mkdtempSync(join(tmpdir(), 'factory-tour-'));
const fallow = (() => {
  try {
    const archive = spawnSync('git', ['archive', 'HEAD'], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(archive.error, undefined);
    assert.equal(archive.status, 0);
    const unpack = run('tar', ['-x', '-C', directory], { input: archive.stdout });
    assert.equal(unpack.exitCode, 0);
    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'));
    const binary = join(root, 'node_modules/.bin/fallow');
    const args = ['architecture', '-q', '--format', 'json'];
    const valid = run(binary, args, { cwd: directory });
    assert.equal(valid.exitCode, 0, valid.stderr);
    const domain = join(directory, 'apps/api/src/features/greeting/domain.ts');
    const original = readFileSync(domain, 'utf8');
    writeFileSync(domain, `export { greet } from './application.ts';\n${original}`);
    const prohibited = run(binary, args, { cwd: directory });
    assert.equal(prohibited.exitCode, 1, prohibited.stderr);
    const report = JSON.parse(prohibited.stdout);
    assert.ok(
      report.boundary_violations.some(
        (finding) => finding.from_zone === 'api-domain' && finding.to_zone === 'api-application',
      ),
    );
    writeFileSync(domain, original);
    const restored = run(binary, args, { cwd: directory });
    assert.equal(restored.exitCode, 0);
    return {
      fixture:
        'HEAD archive with installed dependencies linked; only a value re-export in domain.ts is added, then restored. Gate configuration is unchanged.',
      valid,
      prohibited,
      restored,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
})();
console.log(
  JSON.stringify(
    {
      sourceHead: run('git', ['rev-parse', 'HEAD']).stdout.trim(),
      evidenceType: 'LOCAL RUNTIME AND SYNTHETIC FIXTURES, NOT AUTHENTICATED HUMAN APPROVAL',
      guard,
      lint: { before, after, problems, proseControl: control },
      approval: { namedUser, wrongUser, newHead },
      fallow,
    },
    null,
    2,
  ),
);
