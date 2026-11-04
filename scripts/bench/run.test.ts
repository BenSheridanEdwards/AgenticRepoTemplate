import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { text } from 'node:stream/consumers';

async function arrangeStoreFixture() {
  const root = mkdtempSync(join(tmpdir(), 'bench-store-'));
  const repository = join(root, 'repository');
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), content);
  };
  write('package/package.json', '{"name":"bench-dependency","version":"1.0.0","main":"index.js"}');
  write('package/index.js', 'module.exports = "available";');
  const tarball = execFileSync('tar', ['-czf', '-', 'package'], { cwd: repository });
  const tarballRequests = jest.fn();
  const server = createServer((request, response) => {
    if (request.url?.endsWith('.tgz')) {
      tarballRequests(request.url);
      response.end(tarball);
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        name: 'bench-dependency',
        'dist-tags': { latest: '1.0.0' },
        time: { '1.0.0': '2020-01-01T00:00:00.000Z' },
        versions: {
          '1.0.0': {
            name: 'bench-dependency',
            version: '1.0.0',
            dist: {
              tarball: `http://${request.headers.host}/dependency.tgz`,
              integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
            },
          },
        },
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing tarball server address');
  const run = async (executable: string, args: string[], offline = false) => {
    const child = spawn(executable, args, {
      cwd: repository,
      env: {
        ...process.env,
        pnpm_config_offline: String(offline),
        pnpm_config_pm_on_fail: 'ignore',
      },
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const [[status], stdout, stderr] = await Promise.all([
      once(child, 'close'),
      text(child.stdout),
      text(child.stderr),
    ]);
    return { status, stdout, stderr };
  };
  write('.npmrc', `registry=http://127.0.0.1:${address.port}/\n`);
  write('.gitignore', 'node_modules/\n.pnpm-store/\n');
  write('.fallowrc.jsonc', '{\n}\n');
  write(
    'package.json',
    JSON.stringify({
      private: true,
      packageManager: 'pnpm@11.3.0',
      dependencies: { 'bench-dependency': '1.0.0' },
      scripts: {
        'arch:diagram': 'node -e ""',
        probe: `node -e "require('node:assert/strict').equal(require('bench-dependency'), 'available')"`,
      },
    }),
  );
  write(
    'pnpm-workspace.yaml',
    "packages: ['apps/*', 'showcase/*/web', 'showcase/*/api']\nminimumReleaseAge: 10080\nstoreDir: .pnpm-store\n",
  );
  ['web', 'api'].forEach((kind) => {
    write(
      `apps/${kind}/package.json`,
      JSON.stringify({
        name: `@repo/${kind}`,
        dependencies: { 'bench-dependency': '1.0.0' },
      }),
    );
  });
  write('apps/web/src/App.tsx', 'export const fixture = true;\n');
  return {
    repository,
    run,
    tarballRequests,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('reuses the caller store offline when archived workspaces select another store', async () => {
  const fixture = await arrangeStoreFixture();
  const { repository, run, tarballRequests } = fixture;
  try {
    const seed = await run('pnpm', ['install', '--ignore-scripts']);
    expect(seed).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
    expect(tarballRequests).toHaveBeenCalledWith('/dependency.tgz');
    tarballRequests.mockClear();
    const callerStore = await run('pnpm', ['store', 'path']);
    expect(callerStore.status).toBe(0);
    expect(callerStore.stdout.trim()).toContain(join(repository, '.pnpm-store'));
    execFileSync('git', ['init', '-b', 'main'], { cwd: repository });
    execFileSync('git', ['add', '.'], { cwd: repository });
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture'],
      { cwd: repository },
    );
    const result = await run(
      'node',
      [
        resolve('scripts/bench/run.mjs'),
        '--packages',
        '2',
        '--steps',
        'probe',
        '--compare',
        'main',
      ],
      true,
    );
    expect(result).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
    expect(result.stdout).toContain('| probe | one-change |');
    expect(result.stdout.match(/reused 1, downloaded 0/g)).toHaveLength(2);
    expect(tarballRequests).not.toHaveBeenCalled();
    const directories = [...result.stdout.matchAll(/Workspace: (.+)/g)].map((match) => match[1]);
    expect(directories).toHaveLength(2);
    directories.forEach((directory) => {
      expect(existsSync(directory)).toBe(false);
    });
  } finally {
    await fixture.close();
  }
}, 60_000);

// Slow: installs an offline generated workspace and drives the real gates.
test.each([false, true])('slow: isolated benchmark cleans up (type error: %s)', (inject) => {
  const status = () => spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
  const before = status();
  const config = readFileSync('.fallowrc.jsonc', 'utf8');
  const lock = readFileSync('pnpm-lock.yaml', 'utf8');
  const start = Date.now();
  const result = spawnSync(
    'node',
    [
      'scripts/bench/run.mjs',
      '--packages',
      '2',
      '--steps',
      'typecheck,arch:gate',
      ...(inject ? ['--inject-error'] : []),
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(inject ? 1 : 0);
  if (inject) expect(result.stderr).toContain('typecheck');
  else
    ['cold', 'warm', 'one-change'].forEach((mode) => {
      expect(result.stdout).toMatch(new RegExp(`\\| typecheck \\| ${mode} \\| \\d+ \\|`));
    });
  const directory = result.stdout.match(/Workspace: (.+)/)?.[1];
  expect(directory).toBeDefined();
  expect(existsSync(String(directory))).toBe(false);
  expect(readFileSync('.fallowrc.jsonc', 'utf8')).toBe(config);
  expect(readFileSync('pnpm-lock.yaml', 'utf8')).toBe(lock);
  expect(status()).toBe(before);
  expect(Date.now() - start).toBeLessThan(120_000);
}, 120_000);
