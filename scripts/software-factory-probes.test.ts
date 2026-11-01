import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('software factory evidence replay', () => {
  it('reports passing controls and intended refusals without running bypass commands', () => {
    const result = spawnSync(process.execPath, ['scripts/software-factory-probes.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.guard.map(({ exitCode }: { exitCode: number }) => exitCode)).toEqual([
      2, 2, 2, 0,
    ]);
    expect(report.lint.problems).toEqual([
      { path: 'eslint.config.js', area: 'Lint config', reason: 'edits enforcement code' },
    ]);
    expect(report.lint.proseControl).toEqual([]);
    expect(report.approval.namedUser.status.state).toBe('success');
    expect(report.approval.wrongUser.status.state).toBe('failure');
    expect(report.approval.newHead.status.state).toBe('failure');
    expect(report.fallow.valid.exitCode).toBe(0);
    expect(report.fallow.prohibited.exitCode).toBe(1);
    expect(report.fallow.restored.exitCode).toBe(0);
  }, 30_000);
});
