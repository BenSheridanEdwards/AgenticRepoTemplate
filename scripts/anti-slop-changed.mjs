import { execFileSync, spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

function git(cwd, ...args) {
  return execFileSync('git', ['--literal-pathspecs', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function addedRanges(diff) {
  return [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].flatMap(
    ([, start, count = '1']) =>
      Number(count) === 0 ? [] : [{ start: Number(start), end: Number(start) + Number(count) }],
  );
}

function lint(root) {
  const result = spawnSync(
    'env',
    [
      '-u',
      'NAPI_RS_NATIVE_LIBRARY_PATH',
      '-u',
      'VP_VERSION',
      '-u',
      'OXLINT_TSGOLINT_PATH',
      'oxlint',
      '--no-ignore',
      '--config',
      'anti-slop.advisory.mjs',
      '--format',
      'json',
      '--',
      '.',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.error) throw result.error;

  if (![0, 1].includes(result.status)) {
    throw new Error(`oxlint failed (${result.status}): ${result.stderr}`);
  }

  return readDiagnostics(result);
}

function readDiagnostics(result) {
  try {
    const { diagnostics } = JSON.parse(result.stdout);

    return validateDiagnostics(diagnostics, result.status);
  } catch (error) {
    throw new Error(`oxlint output could not be read: ${error.message}\n${result.stderr}`);
  }
}

function validateDiagnostics(diagnostics, status) {
  if (!Array.isArray(diagnostics) || (status === 1 && diagnostics.length === 0)) {
    throw new Error('Expected oxlint diagnostics');
  }

  return diagnostics;
}

function changedLines(root) {
  const diffArgs = [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--no-color',
    '--find-renames',
    '--diff-filter=AMR',
    'origin/main...HEAD',
  ];

  const paths = git(root, ...diffArgs, '--name-only', '-z')
    .split('\0')
    .filter(Boolean);

  const patches = git(root, ...diffArgs, '-U0')
    .split(/^diff --git /m)
    .slice(1);

  if (paths.length !== patches.length) throw new Error('Git paths and patches do not match.');

  // Both Git outputs use the same ordering; NUL-delimited paths preserve quoted filenames.
  return new Map(paths.map((file, index) => [file, addedRanges(patches[index])]));
}

function run() {
  const root = git(process.cwd(), 'rev-parse', '--show-toplevel').trim();

  git(root, 'rev-parse', '--verify', 'origin/main^{commit}');

  if (git(root, 'diff', '--name-only', 'HEAD', '--').trim()) {
    throw new Error('Commit or stash tracked changes before checking committed lines.');
  }

  const changes = changedLines(root);

  if (changes.size === 0) return 0;

  const findings = lint(root).flatMap((diagnostic) => {
    const { filename, code, message, labels } = diagnostic;

    if (!code) {
      throw new Error(`oxlint could not lint the source: ${JSON.stringify(diagnostic)}`);
    }

    const file = relative(root, resolve(root, filename));
    const ranges = changes.get(file) ?? [];

    const label = labels.find(({ span }) =>
      ranges.some(({ start, end }) => span.line >= start && span.line < end),
    );

    return label ? [`${file}:${label.span.line} ${code} ${message.replace(/\s+/g, ' ')}`] : [];
  });

  findings.forEach((finding) => {
    console.log(finding);
  });

  return findings.length > 0 ? 1 : 0;
}

try {
  process.exitCode = run();
} catch (error) {
  console.error(`anti-slop changed: ${error.message}`);
  process.exitCode = 1;
}
