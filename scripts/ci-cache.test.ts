import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { formatCacheReport } from './ci-cache-report.mjs';

const read = (path: string) => readFileSync(path, 'utf8');
const action = () => read('.github/actions/setup/action.yml');
const steps = () => action().split(/(?=^ {4}- )/m);

test('every install lane uses shared setup with its original install flags and scope', () => {
  const ci = read('.github/workflows/ci.yml');
  expect(ci).not.toMatch(/pnpm\/action-setup|cache: pnpm|run: pnpm install/);
  const jobs = ci.split(/(?=^ {2}[\w-]+:)/m);
  [
    'quality',
    'fallow',
    'test',
    'contract',
    'integration',
    'tooling',
    'build',
    'e2e',
    'security',
  ].forEach((name) => {
    const job = jobs.find((text) => text.startsWith(`  ${name}:`)) ?? '';
    expect(job).toContain('uses: ./.github/actions/setup');
    expect(job).toContain('persistent-store: $' + '{{ vars.PNPM_STORE_DIR }}');
    expect(job).toContain('save-cache: $' + '{{ inputs.save_pnpm_cache == true }}');
    if (['contract', 'tooling'].includes(name))
      expect(job).toContain('install-command: pnpm install --frozen-lockfile\n');
    if (['fallow', 'test', 'build', 'e2e'].includes(name))
      expect(job).toMatch(
        /uses: \.\/\.github\/actions\/setup\n {8}if: steps.scope.outputs.docs-only != 'true'/,
      );
  });
});

test('manual save defaults off and the automated dispatcher never enables it', () => {
  expect(read('.github/workflows/ci.yml')).toMatch(
    /save_pnpm_cache:\n\s+description: .*manual-only.*\n\s+type: boolean\n\s+default: false/,
  );
  expect(read('.github/workflows/main-tree.yml')).not.toContain('save_pnpm_cache');
  expect(action()).toContain("default: 'false'");
});

test('save requires main, manual dispatch, explicit opt-in and no exact hit', () => {
  const save = steps().find((step) => step.includes('uses: actions/cache/save@')) ?? '';
  const condition = save.match(/if: (.*)/)?.[1] ?? '';
  expect(condition).toBe(
    "inputs.persistent-store == '' && github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch' && inputs.save-cache == 'true' && steps.restore.outputs.cache-hit != 'true'",
  );
  const evaluate = (persistent: string, ref: string, event: string, enabled: string, hit: string) =>
    Function(
      'persistent',
      'ref',
      'event',
      'enabled',
      'hit',
      `return ${condition.replaceAll('inputs.persistent-store', 'persistent').replaceAll('github.ref', 'ref').replaceAll('github.event_name', 'event').replaceAll('inputs.save-cache', 'enabled').replaceAll('steps.restore.outputs.cache-hit', 'hit')}`,
    )(persistent, ref, event, enabled, hit);
  expect(evaluate('', 'refs/heads/main', 'workflow_dispatch', 'true', 'false')).toBe(true);
  [
    ['store', 'refs/heads/main', 'workflow_dispatch', 'true', 'false'],
    ['', 'refs/heads/feature', 'workflow_dispatch', 'true', 'false'],
    ['', 'refs/heads/main', 'pull_request', 'true', 'false'],
    ['', 'refs/heads/main', 'push', 'true', 'false'],
    ['', 'refs/heads/main', 'workflow_dispatch', 'false', 'false'],
    ['', 'refs/heads/main', 'workflow_dispatch', 'true', 'true'],
  ].forEach(([persistent, ref, event, enabled, hit]) => {
    expect(evaluate(persistent, ref, event, enabled, hit)).toBe(false);
  });
});

test('restore and save bypass persistent stores and use narrowly keyed stores', () => {
  const restore = steps().find((step) => step.includes('uses: actions/cache/restore@')) ?? '';
  expect(restore).toContain("if: inputs.persistent-store == ''");
  expect(action()).toContain(
    `pnpm-store-\${{ runner.os }}-\${{ hashFiles('.nvmrc') }}-\${{ hashFiles('pnpm-lock.yaml') }}`,
  );
  expect(restore).toContain(
    `restore-keys: pnpm-store-\${{ runner.os }}-\${{ hashFiles('.nvmrc') }}-`,
  );
  expect(action()).toContain('pnpm config set store-dir "$PERSISTENT_STORE"');
  expect(action()).toContain('pnpm store path');
  expect(action()).toContain('node scripts/ci-cache-report.mjs');
});

test.each([
  [{ CACHE_HIT: 'true', MATCHED_KEY: 'key' }, 'hit'],
  [{ CACHE_HIT: 'false', MATCHED_KEY: 'older' }, 'partial'],
  [{ CACHE_HIT: '', MATCHED_KEY: '' }, 'miss'],
  [{ PERSISTENT: 'true' }, 'persistent'],
])('reports %j as %s', (shape, status) => {
  expect(formatCacheReport({ CACHE_NAME: 'key', ...shape })).toBe(`pnpm store: ${status} (key)\n`);
  const result = spawnSync(process.execPath, ['scripts/ci-cache-report.mjs'], {
    encoding: 'utf8',
    env: { CACHE_NAME: 'key', ...shape },
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(`pnpm store: ${status} (key)\n`);
});

test('rejects an unknown cache shape', () => {
  const result = spawnSync(process.execPath, ['scripts/ci-cache-report.mjs'], {
    encoding: 'utf8',
    env: { CACHE_NAME: 'key', CACHE_HIT: 'perhaps' },
  });
  expect(result.status).toBe(1);
});
