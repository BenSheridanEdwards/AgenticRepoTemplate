/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TSC_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/tsc');

/**
 * Type-checks `files` as an ES module package whose tsconfig extends the
 * repo's real `program` config, and returns the TypeScript error codes. The
 * package sits in the gitignored `.cache/` so the program's `types` resolve
 * from the repo's node_modules, as they do for a real package.
 */
function typeCheck(program: 'tsconfig.json' | 'tsconfig.api.json', files: Record<string, string>) {
  mkdirSync(join(REPOSITORY_ROOT, '.cache'), { recursive: true });
  const directory = mkdtempSync(join(REPOSITORY_ROOT, '.cache/typescript-programs-'));
  try {
    const tsconfig = { extends: join(REPOSITORY_ROOT, program), include: ['src'] };
    const tree = {
      'package.json': '{ "type": "module" }\n',
      'tsconfig.json': JSON.stringify(tsconfig),
      ...files,
    };
    for (const [path, source] of Object.entries(tree)) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), source);
    }
    const run = spawnSync(TSC_BIN, ['-p', 'tsconfig.json', '--noEmit'], {
      cwd: directory,
      encoding: 'utf8',
    });
    return {
      status: run.status,
      errors: [...run.stdout.matchAll(/error (TS\d+)/g)].map(([, code]) => code),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * Type-checks `files`, written at their repo paths, with copies of the repo's
 * real TypeScript configs, so the `program`'s own `include` picks them up.
 */
function typeCheckAtRepoPaths(program: 'tsconfig.domain.json', files: Record<string, string>) {
  mkdirSync(join(REPOSITORY_ROOT, '.cache'), { recursive: true });
  const directory = mkdtempSync(join(REPOSITORY_ROOT, '.cache/typescript-programs-'));
  try {
    for (const config of ['tsconfig.base.json', 'tsconfig.api.json', program]) {
      copyFileSync(join(REPOSITORY_ROOT, config), join(directory, config));
    }
    const tree = { 'package.json': '{ "type": "module" }\n', ...files };
    for (const [path, source] of Object.entries(tree)) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), source);
    }
    const run = spawnSync(TSC_BIN, ['-p', program, '--noEmit'], {
      cwd: directory,
      encoding: 'utf8',
    });
    return {
      status: run.status,
      errors: [...run.stdout.matchAll(/error (TS\d+)/g)].map(([, code]) => code),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const GREETING = {
  'src/domain.ts': 'export const formatGreeting = (name: string) => "Hello, " + name;\n',
};

describe('TypeScript programs', () => {
  jest.setTimeout(60_000);

  it('passes api code that imports a relative file with its .ts extension', () => {
    const result = typeCheck('tsconfig.api.json', {
      ...GREETING,
      'src/application.ts':
        "import { formatGreeting } from './domain.ts';\nexport const greet = (name: string) => formatGreeting(name);\n",
    });
    expect(result).toEqual({ status: 0, errors: [] });
  });

  it.each([
    [
      'reads a DOM global',
      'src/trpc.ts',
      'export const title = document.title;\n',
      'TS2584', // Cannot find name 'document'; the api program has no DOM lib.
    ],
    [
      'imports a relative file without its extension',
      'src/application.ts',
      "import { formatGreeting } from './domain';\nexport const greet = formatGreeting;\n",
      'TS2835', // Relative imports need explicit file extensions under NodeNext.
    ],
    [
      'declares an enum, which Node cannot strip',
      'src/application.ts',
      'export enum Tone {\n  Warm,\n}\n',
      'TS1294', // Not allowed when erasableSyntaxOnly is enabled.
    ],
  ])('fails api code that %s', (_label, path, source, code) => {
    const result = typeCheck('tsconfig.api.json', { ...GREETING, [path]: source });
    expect(result).toEqual({ status: 2, errors: [code] });
  });

  it('gives web code the DOM', () => {
    const result = typeCheck('tsconfig.json', {
      'src/title.ts': 'export const title = document.title;\n',
    });
    expect(result).toEqual({ status: 0, errors: [] });
  });

  it.each([
    'apps/api/src/features/greeting/domain.ts',
    'apps/api/src/features/greeting/domain/format.ts',
    'showcase/x/api/src/features/todo/domain.ts',
    'showcase/x/api/src/features/todo/domain/format.ts',
  ])('passes pure domain code in %s', (path) => {
    const result = typeCheckAtRepoPaths('tsconfig.domain.json', {
      [path]: `export const formatGreeting = (name: string) => \`Hello, \${name}!\`;\n`,
    });
    expect(result).toEqual({ status: 0, errors: [] });
  });

  it.each([
    [
      'reads process.env',
      'apps/api/src/features/greeting/domain.ts',
      'export const suffix = process.env.SUFFIX;\n',
      'TS2591', // Cannot find name 'process'; the domain program has no Node types.
    ],
    [
      'exits the process',
      'showcase/x/api/src/features/todo/domain.ts',
      'export const stop = () => process.exit(1);\n',
      'TS2591',
    ],
    [
      'loads Node through createRequire',
      'apps/api/src/features/greeting/domain/format.ts',
      "import { createRequire } from 'node:module';\nexport const fs = createRequire('/')('fs');\n",
      'TS2307', // Cannot find module 'node:module'.
    ],
    [
      'imports Node file IO dynamically',
      'showcase/x/api/src/features/todo/domain/format.ts',
      "export const fs = import('node:fs');\n",
      'TS2307',
    ],
  ])('fails domain code that %s', (_label, path, source, code) => {
    const result = typeCheckAtRepoPaths('tsconfig.domain.json', { [path]: source });
    expect(result).toEqual({ status: 2, errors: [code] });
  });

  it.each([
    ['process.env', 'export const origin = process.env.API_ORIGIN;\n'],
    ['Buffer', "export const bytes = Buffer.from('Ada');\n"],
  ])('fails web code that reads the Node global %s', (_label, source) => {
    const result = typeCheck('tsconfig.json', { 'src/apiOrigin.ts': source });
    expect(result).toEqual({ status: 2, errors: ['TS2591'] });
  });
});
