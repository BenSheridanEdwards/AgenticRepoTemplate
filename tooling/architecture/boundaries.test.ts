/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FALLOW_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/fallow');
const WEB = 'apps/web/src';

/** A clean copy of the web package's role layout: every import follows the rules. */
const LAYOUT: Record<string, string> = {
  'package.json': '{ "name": "root", "private": true, "type": "module" }\n',
  'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
  'apps/web/package.json': '{ "name": "@repo/web", "private": true, "type": "module" }\n',
  'apps/web/index.html': '<script type="module" src="/src/main.tsx"></script>\n',
  [`${WEB}/main.tsx`]: "import { App } from './App';\nexport const root = App;\n",
  [`${WEB}/App.tsx`]: "import { home } from './routes/home';\nexport const App = home;\n",
  [`${WEB}/routes/home/index.ts`]:
    "import { counter } from '../../features/counter';\nimport { status } from '../../features/status';\nexport const home = counter + status;\n",
  [`${WEB}/routes/settings/index.ts`]: 'export const settings = 1;\n',
  [`${WEB}/features/counter/index.ts`]:
    "import { resource } from '../../shared/resource';\nexport const counter = resource;\n",
  [`${WEB}/features/status/index.ts`]: 'export const status = 1;\n',
  [`${WEB}/shared/resource/index.ts`]: 'export const resource = 1;\n',
};

interface BoundaryViolation {
  from_zone: string;
  to_zone: string;
}

/** Runs the real Fallow architecture gate with the repo's `.fallowrc.jsonc` over the layout plus `seed`. */
function architectureGate(seed: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'fallow-boundaries-'));
  try {
    copyFileSync(join(REPOSITORY_ROOT, '.fallowrc.jsonc'), join(directory, '.fallowrc.jsonc'));
    for (const [path, source] of Object.entries({ ...LAYOUT, ...seed })) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), source);
    }
    const run = spawnSync(FALLOW_BIN, ['architecture', '-q', '--format', 'json'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const report = JSON.parse(run.stdout) as { boundary_violations?: BoundaryViolation[] };
    return {
      status: run.status,
      zones: (report.boundary_violations ?? []).map(({ from_zone, to_zone }) => [
        from_zone,
        to_zone,
      ]),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('Fallow role boundaries under apps/web/src', () => {
  jest.setTimeout(30_000);

  it('passes the clean layout', () => {
    expect(architectureGate()).toEqual({ status: 0, zones: [] });
  });

  it('lets a loose file directly under features import features and shared, as the group rule allows', () => {
    const loose = {
      [`${WEB}/features/loose.ts`]:
        "import { counter } from './counter';\nimport { status } from './status';\nexport const loose = counter + status;\n",
    };
    expect(architectureGate(loose)).toEqual({ status: 0, zones: [] });
  });

  it('fails when a feature imports a loose file directly under features', () => {
    const seed = {
      [`${WEB}/features/loose.ts`]: 'export const loose = 1;\n',
      [`${WEB}/features/status/index.ts`]:
        "import { loose } from '../loose';\nexport const status = loose;\n",
    };
    expect(architectureGate(seed)).toEqual({ status: 1, zones: [['features/status', 'features']] });
  });

  it.each([
    [
      'a feature imports another feature',
      `${WEB}/features/counter/index.ts`,
      "import { status } from '../status';\nexport const counter = status;\n",
      ['features/counter', 'features/status'],
    ],
    [
      'a route imports another route',
      `${WEB}/routes/home/index.ts`,
      "import { counter } from '../../features/counter';\nimport { settings } from '../settings';\nexport const home = counter + settings;\n",
      ['routes/home', 'routes/settings'],
    ],
    [
      'a feature imports a route',
      `${WEB}/features/status/index.ts`,
      "import { settings } from '../../routes/settings';\nexport const status = settings;\n",
      ['features/status', 'routes/settings'],
    ],
    [
      'shared code imports a feature',
      `${WEB}/shared/resource/index.ts`,
      "import { status } from '../../features/status';\nexport const resource = status;\n",
      ['shared', 'features/status'],
    ],
    [
      'a loose file directly under features imports a route',
      `${WEB}/features/loose.ts`,
      "import { settings } from '../routes/settings';\nexport const loose = settings;\n",
      ['features', 'routes/settings'],
    ],
    [
      'the app imports a feature',
      `${WEB}/App.tsx`,
      "import { home } from './routes/home';\nimport { status } from './features/status';\nexport const App = home + status;\n",
      ['app', 'features/status'],
    ],
  ])('fails when %s', (_label, path, source, zones) => {
    expect(architectureGate({ [path]: source })).toEqual({ status: 1, zones: [zones] });
  });
});
