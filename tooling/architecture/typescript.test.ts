/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TSC_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/tsc');

/**
 * Type-checks `files` as an ES module package whose tsconfig extends the
 * repo's real `program` config, and returns the TypeScript error codes.
 */
function typeCheck(program: 'tsconfig.json' | 'tsconfig.api.json', files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'typescript-programs-'));
  try {
    const tsconfig = {
      extends: join(REPOSITORY_ROOT, program),
      compilerOptions: { types: [], typeRoots: [] },
      include: ['src'],
    };
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
});
