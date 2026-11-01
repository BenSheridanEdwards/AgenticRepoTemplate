import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { benchFallowConfig, planWorkspace } from './generate.mjs';

const { values } = parseArgs({
  options: {
    packages: { type: 'string', default: '60' },
    steps: {
      type: 'string',
      default: 'typecheck,lint:policy,lint:anti-slop,check,fallow:audit,arch:gate,test,build',
    },
    compare: { type: 'string' },
    keep: { type: 'boolean' },
    'inject-error': { type: 'boolean' },
  },
});
const packages = Number(values.packages);
planWorkspace({ packages, reference: {} });
const steps = values.steps.split(',');
if (steps.some((step) => !/^[a-z][a-z:-]*$/.test(step))) throw new Error('Invalid step name');
const repository = process.cwd();
const environment = { ...process.env, FALLOW_BASE: 'main' };
// A caller's hook must not bind the throwaway copy to its original Git index.
Object.keys(environment)
  .filter((key) => key.startsWith('GIT_'))
  .forEach((key) => {
    delete environment[key];
  });
function command(cwd, executable, args, env = environment) {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${executable} ${args.join(' ')} failed\n${result.error ?? ''}${result.stdout}${result.stderr}`,
    );
  return result.stdout;
}
const commit = (cwd, message) =>
  command(
    cwd,
    'git',
    [
      '-c',
      'user.name=Ben Sheridan-Edwards',
      '-c',
      'user.email=bensheridanedwards@gmail.com',
      'commit',
      '-m',
      message,
    ],
    { ...environment, HUSKY: '0' },
  );

function prepare(directory, ref) {
  const archive = spawnSync('git', ['archive', ref], {
    cwd: repository,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (archive.status !== 0) throw new Error(`git archive ${ref} failed: ${archive.stderr}`);
  const extract = spawnSync('tar', ['-x', '-C', directory], { input: archive.stdout });
  if (extract.status !== 0) throw new Error(`Archive extraction failed: ${extract.stderr}`);
  const config = join(directory, '.fallowrc.jsonc');
  writeFileSync(config, benchFallowConfig(readFileSync(config, 'utf8')));
  command(directory, 'git', ['init', '-b', 'main']);
  command(directory, 'git', ['add', '.']);
  commit(directory, 'build(bench): archive baseline');
  const files = command(directory, 'git', [
    'ls-files',
    'apps/web',
    'apps/api',
    'apps/architecture.mmd',
  ])
    .trim()
    .split('\n');
  const reference = Object.fromEntries(
    files.map((path) => [path, readFileSync(join(directory, path), 'utf8')]),
  );
  const plan = planWorkspace({ packages, reference });
  Object.entries(plan).forEach(([path, content]) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  });
  command(directory, 'git', ['checkout', '-b', 'bench']);
  command(directory, 'pnpm', ['install', '--offline', '--no-frozen-lockfile']);
  command(directory, 'git', ['add', '.']);
  command(directory, 'pnpm', ['arch:diagram']);
  command(directory, 'git', ['add', '.']);
  commit(directory, 'build(bench): generate results');
}

function measure(ref) {
  const directory = mkdtempSync(join(tmpdir(), 'bench-'));
  console.log(`Workspace: ${directory}`);
  try {
    prepare(directory, ref);
    const resultNumber = String(Math.min(3, packages / 2)).padStart(3, '0');
    const source = join(directory, `showcase/bench-${resultNumber}/web/src/App.tsx`);
    if (values['inject-error'])
      appendFileSync(
        join(directory, 'showcase/bench-001/web/src/App.tsx'),
        '\nconst benchError: never = 1;\n',
      );
    const rows = ['cold', 'warm', 'one-change'].flatMap((mode) => {
      if (mode === 'cold')
        ['.cache', 'node_modules/.cache', '.turbo'].forEach((path) => {
          rmSync(join(directory, path), { recursive: true, force: true });
        });
      if (mode === 'one-change') appendFileSync(source, '// Benchmark: one source file changed.\n');
      return steps.map((step) => {
        const start = performance.now();
        command(directory, 'pnpm', [step]);
        return { step, mode, ms: Math.round(performance.now() - start) };
      });
    });
    writeFileSync(
      join(directory, 'bench-results.json'),
      `${JSON.stringify({ ref, packages, rows }, null, 2)}\n`,
    );
    return rows;
  } finally {
    if (!values.keep) rmSync(directory, { recursive: true, force: true });
  }
}

try {
  const before = values.compare ? measure(values.compare) : undefined;
  const after = measure('HEAD');
  const table = before
    ? [
        '| Step | Mode | Before ms | After ms | Difference ms |',
        '| --- | --- | ---: | ---: | ---: |',
        ...after.map(
          (row, index) =>
            `| ${row.step} | ${row.mode} | ${before[index].ms} | ${row.ms} | ${row.ms - before[index].ms} |`,
        ),
      ]
    : [
        '| Step | Mode | ms |',
        '| --- | --- | ---: |',
        ...after.map((row) => `| ${row.step} | ${row.mode} | ${row.ms} |`),
      ];
  console.log(table.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table.join('\n')}\n`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
