/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { uiRelevantFiles } from './lighthouse-scope.mjs';

const SCRIPT = join(process.cwd(), 'scripts/lighthouse-scope.mjs');

describe('uiRelevantFiles', () => {
  it.each([
    'src/App.tsx',
    'src/features/status/StatusCard.tsx',
    'src/styles/global.css',
    'public/favicon.svg',
    'index.html',
    'vite.config.ts',
    'tsconfig.json',
    'package.json',
    'pnpm-lock.yaml',
    '.nvmrc',
    'lighthouserc.json',
    '.github/workflows/lighthouse.yml',
    'scripts/lighthouse-scope.mjs',
  ])('audits a pull request that changes %s', (path) => {
    expect(uiRelevantFiles([path])).toEqual([path]);
  });

  it.each([
    'src/App.test.tsx',
    'src/features/status/StatusCard.test.tsx',
    'src/lib/format.test.ts',
    'README.md',
    'docs/required-gates.md',
    'scripts/required-gates.mjs',
    'scripts/lighthouse-scope.test.ts',
    '.github/workflows/ci.yml',
    'e2e/app.spec.ts',
    '.agents/project/QUALITY_GATES.md',
    'srcfile.ts',
    'nested/index.html',
    'nested/package.json',
  ])('skips audits for a pull request that changes only %s', (path) => {
    expect(uiRelevantFiles([path])).toEqual([]);
  });

  it('keeps only the UI-relevant files of a mixed change, in order', () => {
    expect(
      uiRelevantFiles(['README.md', 'src/App.tsx', 'src/App.test.tsx', 'package.json']),
    ).toEqual(['src/App.tsx', 'package.json']);
  });

  it('skips audits when nothing changed', () => {
    expect(uiRelevantFiles([])).toEqual([]);
  });
});

describe('lighthouse-scope CLI', () => {
  function runInRepository(changedFiles: string[], setup: string[] = []) {
    const directory = mkdtempSync(join(tmpdir(), 'lighthouse-scope-'));
    const git = (...args: string[]) =>
      expect(
        spawnSync(
          'git',
          ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
          { cwd: directory },
        ).status,
      ).toBe(0);
    const write = (file: string) => {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      writeFileSync(join(directory, file), `${file}\n`);
    };
    git('init', '-q');
    setup.forEach(write);
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', 'base');
    changedFiles.forEach(write);
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', 'change');
    return { directory, git };
  }

  function runScope(directory: string) {
    const output = join(directory, 'output');
    const summary = join(directory, 'summary');
    const result = spawnSync('node', [SCRIPT], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    });
    const read = (path: string) => readFileSync(path, 'utf8');
    const outcome = { status: result.status, output: read(output), summary: read(summary) };
    rmSync(directory, { recursive: true, force: true });
    return outcome;
  }

  function scopeOf(changedFiles: string[]) {
    return runScope(runInRepository(changedFiles).directory);
  }

  it('reports ui-changed=true and lists the files when the head commit touches UI', () => {
    const outcome = scopeOf(['src/App.tsx', 'README.md']);
    expect(outcome.status).toBe(0);
    expect(outcome.output).toBe('ui-changed=true\n');
    expect(outcome.summary).toContain('src/App.tsx');
    expect(outcome.summary).not.toContain('README.md');
  });

  it('reports ui-changed=false when the head commit touches only non-UI files', () => {
    const outcome = scopeOf(['README.md', 'src/App.test.tsx']);
    expect(outcome.status).toBe(0);
    expect(outcome.output).toBe('ui-changed=false\n');
    expect(outcome.summary).toContain('Lighthouse audits skipped');
  });

  it('audits a pull request that moves a file out of src', () => {
    const { directory, git } = runInRepository([], ['src/Card.tsx']);
    mkdirSync(join(directory, 'archive'));
    git('mv', 'src/Card.tsx', 'archive/Card.tsx');
    git('commit', '-q', '-m', 'move');
    const outcome = runScope(directory);
    expect(outcome.output).toBe('ui-changed=true\n');
    expect(outcome.summary).toContain('src/Card.tsx');
  });

  it('audits a pull request that changes a non-ASCII file name under src', () => {
    const outcome = scopeOf(['src/café.tsx']);
    expect(outcome.output).toBe('ui-changed=true\n');
    expect(outcome.summary).toContain('src/café.tsx');
  });
});
