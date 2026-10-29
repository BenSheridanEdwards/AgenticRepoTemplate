import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContract } from './contract.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** This repository's contract, read through Fallow as the CLIs read it. */
export function loadRepositoryContract() {
  return loadContract(
    execFileSync(
      join(REPOSITORY_ROOT, 'node_modules/.bin/fallow'),
      ['config', '--format', 'json', '-q'],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ),
  );
}

const COPIED_CONFIGS = [
  '.fallowrc.jsonc',
  'pnpm-workspace.yaml',
  'tooling/architecture/contract.rules.jsonc',
];

const manifest = (fields: {
  name: string;
  private: boolean;
  type: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}) => `${JSON.stringify(fields, null, 2)}\n`;

/**
 * The files of one result under `root` with npm scope `scope`: every required
 * role, the reference manifests' shape, and imports that follow the contract.
 */
export function resultFiles(root: string, scope: string) {
  const web = `${root}/web`;
  const api = `${root}/api`;
  return {
    [`${web}/package.json`]: manifest({
      name: `@${scope}/web`,
      private: true,
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build' },
      dependencies: { '@repo/ui': 'workspace:*', react: '^19.1.0' },
      devDependencies: { [`@${scope}/api`]: 'workspace:*' },
    }),
    [`${web}/index.html`]: '<script type="module" src="/src/main.tsx"></script>\n',
    [`${web}/vite.config.ts`]: 'export default {};\n',
    [`${web}/e2e/greeting.spec.ts`]: 'export const spec = 1;\n',
    [`${web}/src/main.tsx`]:
      "import { App } from './App';\nimport { ApiProvider } from './api-client';\nexport const root = [App, ApiProvider];\n",
    [`${web}/src/App.tsx`]:
      "import { greeting } from './routes/greeting';\nexport const App = greeting;\n",
    [`${web}/src/api-client/index.ts`]:
      "import type { AppRouter } from '../../../api/src/router.ts';\nexport const ApiProvider = 1;\nexport type Router = AppRouter;\n",
    [`${web}/src/routes/greeting/index.ts`]:
      "import { ApiProvider } from '../../api-client';\nexport const greeting = ApiProvider;\n",
    [`${api}/package.json`]: manifest({
      name: `@${scope}/api`,
      private: true,
      type: 'module',
      scripts: { start: 'node src/server.ts' },
      dependencies: { effect: '^3.22.3' },
    }),
    [`${api}/src/server.ts`]:
      "import { appRouter } from './router.ts';\nexport const server = appRouter;\n",
    [`${api}/src/router.ts`]:
      "import { greetingRouter } from './features/greeting/index.ts';\nimport { router } from './trpc.ts';\nexport const appRouter = router(greetingRouter);\nexport type AppRouter = typeof appRouter;\n",
    [`${api}/src/trpc.ts`]: 'export const router = (value: unknown) => value;\n',
    [`${api}/src/features/greeting/index.ts`]:
      "export { greetingRouter } from './procedures.ts';\n",
    [`${api}/src/features/greeting/procedures.ts`]:
      "import { greet } from './application.ts';\nimport { router } from '../../trpc.ts';\nexport const greetingRouter = router(greet);\n",
    [`${api}/src/features/greeting/application.ts`]:
      "import { formatGreeting } from './domain.ts';\nexport const greet = (name: string) => formatGreeting(name);\n",
    [`${api}/src/features/greeting/domain.ts`]:
      "export const formatGreeting = (name: string) => 'Hello, ' + name;\n",
  };
}

/**
 * A temporary git repo holding the reference result, the repo's real Fallow
 * config and rule pack, and `files` on top. A `null` value deletes that path.
 * Returns the directory and a cleanup function.
 */
export function createMonorepo(files: Record<string, string | null>) {
  const directory = mkdtempSync(join(tmpdir(), 'architecture-'));
  COPIED_CONFIGS.forEach((path) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    copyFileSync(join(REPOSITORY_ROOT, path), join(directory, path));
  });
  const layout = {
    'package.json': manifest({ name: 'root', private: true, type: 'module' }),
    '.gitignore': '.cache/\n',
    ...resultFiles('apps', 'repo'),
    ...files,
  };
  Object.entries(layout).forEach(([path, text]) => {
    if (text !== null) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), text);
    }
  });
  spawnSync('git', ['init', '-q'], { cwd: directory });
  return { directory, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

/** Runs `node tooling/architecture/<script> --root <directory> ...args` from this repo. */
export function runTool(script: string, directory: string, ...args: string[]) {
  const run = spawnSync(
    process.execPath,
    [join(REPOSITORY_ROOT, 'tooling/architecture', script), '--root', directory, ...args],
    { encoding: 'utf8' },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}
