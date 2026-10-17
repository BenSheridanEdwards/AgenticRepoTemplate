/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FALLOW_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/fallow');
const RULE_PACK = 'tooling/architecture/contract.rules.jsonc';
const WEB = 'apps/web/src';
const API = 'apps/api/src';
const GREETING = `${API}/features/greeting`;

/** A clean copy of the reference result's role layout: every import follows the contract. */
const LAYOUT: Record<string, string> = {
  'package.json': '{ "name": "root", "private": true, "type": "module" }\n',
  'apps/web/package.json':
    '{ "name": "@repo/web", "private": true, "type": "module", "dependencies": { "@repo/ui": "workspace:*" }, "devDependencies": { "@repo/api": "workspace:*" } }\n',
  'apps/web/index.html': '<script type="module" src="/src/main.tsx"></script>\n',
  [`${WEB}/main.tsx`]:
    "import { App } from './App';\nimport { ApiProvider } from './api-client';\nimport { Button } from '@repo/ui';\nexport const root = [App, ApiProvider, Button];\n",
  [`${WEB}/App.tsx`]:
    "import { greeting } from './routes/greeting';\nexport const App = greeting;\n",
  [`${WEB}/api-client/index.ts`]:
    "import type { AppRouter } from '@repo/api';\nexport const ApiProvider = 1;\nexport type Router = AppRouter;\n",
  [`${WEB}/routes/greeting/index.ts`]:
    "import { ApiProvider } from '../../api-client';\nimport { nameInput } from '../../features/name-input';\nimport { Button } from '@repo/ui';\nexport const greeting = [ApiProvider, nameInput, Button];\n",
  [`${WEB}/routes/settings/index.ts`]: 'export const settings = 1;\n',
  [`${WEB}/features/name-input/index.ts`]:
    "import { Button } from '@repo/ui';\nexport const nameInput = Button;\n",
  [`${WEB}/features/status/index.ts`]: 'export const status = 1;\n',
  'packages/ui/package.json':
    '{ "name": "@repo/ui", "private": true, "type": "module", "exports": { ".": "./src/index.ts" } }\n',
  'packages/ui/src/index.ts': 'export const Button = 1;\n',
  'apps/api/package.json':
    '{ "name": "@repo/api", "private": true, "type": "module", "exports": { ".": { "types": "./src/router.ts" } } }\n',
  [`${API}/server.ts`]:
    "import { createServer } from 'node:http';\nimport { appRouter } from './router.ts';\nexport const server = [createServer, appRouter];\n",
  [`${API}/router.ts`]:
    "import { greetingRouter } from './features/greeting/index.ts';\nimport { router } from './trpc.ts';\nexport const appRouter = router(greetingRouter);\nexport type AppRouter = typeof appRouter;\n",
  [`${API}/trpc.ts`]: 'export const router = (value: unknown) => value;\n',
  [`${GREETING}/index.ts`]: "export { greetingRouter } from './procedures.ts';\n",
  [`${GREETING}/procedures.ts`]:
    "import type { Greeting } from './domain.ts';\nimport { greet } from './application.ts';\nimport { router } from '../../trpc.ts';\nexport const greetingRouter = router((name: string): Greeting => greet(name));\n",
  [`${GREETING}/application.ts`]:
    "import { formatGreeting, type Greeting } from './domain.ts';\nimport { remember } from './integrations.ts';\nexport const greet = (name: string): Greeting => ({ message: formatGreeting(remember(name)) });\n",
  [`${GREETING}/domain.ts`]:
    'export interface Greeting { readonly message: string }\nexport const formatGreeting = (name: string) => "Hello, " + name;\n',
  [`${GREETING}/integrations.ts`]:
    "import type { Greeting } from './domain.ts';\nexport const remember = (name: string) => { void fetch('https://example.com'); return name; };\nexport type Remembered = Greeting;\n",
};

/** The workspace links pnpm would create, so `@repo/*` resolves as it does in the repo. */
const WORKSPACE_LINKS = {
  'node_modules/@repo/api': 'apps/api',
  'node_modules/@repo/ui': 'packages/ui',
};

interface ArchitectureReport {
  boundary_violations?: { from_zone: string; to_zone: string }[];
  boundary_coverage_violations?: { path: string }[];
  policy_violations?: { pack: string; rule_id: string }[];
}

/** Writes the layout plus `seed` into a temporary repo with the real Fallow config and rule pack. */
function withSeededRepository<Result>(
  seed: Record<string, string>,
  run: (directory: string) => Result,
) {
  const directory = mkdtempSync(join(tmpdir(), 'fallow-contract-'));
  try {
    for (const path of ['.fallowrc.jsonc', 'pnpm-workspace.yaml', RULE_PACK]) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      copyFileSync(join(REPOSITORY_ROOT, path), join(directory, path));
    }
    for (const [path, source] of Object.entries({ ...LAYOUT, ...seed })) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), source);
    }
    for (const [link, target] of Object.entries(WORKSPACE_LINKS)) {
      mkdirSync(dirname(join(directory, link)), { recursive: true });
      symlinkSync(join(directory, target), join(directory, link));
    }
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * Runs the real Fallow architecture gate over the layout plus `seed`. Fallow
 * checks rule-pack calls and imports in files an entry point reaches, so each
 * policy seed edits a reachable file; `fallow audit` fails an unreachable one.
 */
function architectureGate(seed: Record<string, string> = {}) {
  return withSeededRepository(seed, (directory) => {
    const run = spawnSync(FALLOW_BIN, ['architecture', '-q', '--format', 'json'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const report = JSON.parse(run.stdout) as ArchitectureReport;
    return {
      status: run.status,
      findings: [
        ...(report.boundary_violations ?? []).map(
          ({ from_zone, to_zone }) => `boundary ${from_zone} -> ${to_zone}`,
        ),
        ...(report.boundary_coverage_violations ?? []).map(({ path }) => `coverage ${path}`),
        ...(report.policy_violations ?? []).map(({ pack, rule_id }) => `policy ${pack}/${rule_id}`),
      ].sort(),
    };
  });
}

describe('Fallow contract over the reference result', () => {
  jest.setTimeout(30_000);

  it('passes the clean layout, including fetch in an integration and Node IO in the api root', () => {
    expect(architectureGate()).toEqual({ status: 0, findings: [] });
  });

  it.each([
    [
      'a route imports another route',
      `${WEB}/routes/greeting/index.ts`,
      "import { settings } from '../settings';\nexport const greeting = settings;\n",
      'boundary web-routes/greeting -> web-routes/settings',
    ],
    [
      'a feature imports another feature',
      `${WEB}/features/name-input/index.ts`,
      "import { status } from '../status';\nexport const nameInput = status;\n",
      'boundary web-features/name-input -> web-features/status',
    ],
    [
      'a feature imports a route',
      `${WEB}/features/status/index.ts`,
      "import { settings } from '../../routes/settings';\nexport const status = settings;\n",
      'boundary web-features/status -> web-routes/settings',
    ],
    [
      'the app imports a feature',
      `${WEB}/App.tsx`,
      "import { greeting } from './routes/greeting';\nimport { status } from './features/status';\nexport const App = [greeting, status];\n",
      'boundary web-app -> web-features/status',
    ],
    [
      'the api client value-imports the router',
      `${WEB}/api-client/index.ts`,
      "import { appRouter } from '@repo/api';\nexport const ApiProvider = appRouter;\n",
      'boundary web-api-client -> api-app',
    ],
    [
      'a route type-imports the api package',
      `${WEB}/routes/settings/index.ts`,
      "import type { AppRouter } from '@repo/api';\nexport const settings = 1;\nexport type Router = AppRouter;\n",
      'boundary web-routes/settings -> api-app',
    ],
    [
      'a ui primitive imports the api client',
      'packages/ui/src/index.ts',
      "import { ApiProvider } from '../../../apps/web/src/api-client';\nexport const Button = ApiProvider;\n",
      'boundary ui -> web-api-client',
    ],
    [
      'procedures call domain code',
      `${GREETING}/procedures.ts`,
      "import { formatGreeting } from './domain.ts';\nimport { router } from '../../trpc.ts';\nexport const greetingRouter = router(formatGreeting);\n",
      'boundary api-procedures -> api-domain',
    ],
    [
      'the api root imports application logic',
      `${API}/router.ts`,
      "import { greet } from './features/greeting/application.ts';\nimport { router } from './trpc.ts';\nexport const appRouter = router(greet);\nexport type AppRouter = typeof appRouter;\n",
      'boundary api-app -> api-application',
    ],
    [
      'the domain imports application logic',
      `${GREETING}/domain.ts`,
      "import { greet } from './application.ts';\nexport interface Greeting { readonly message: string }\nexport const formatGreeting = (name: string) => String(greet) + name;\n",
      'boundary api-domain -> api-application',
    ],
    [
      'an integration imports application logic',
      `${GREETING}/integrations.ts`,
      "import { greet } from './application.ts';\nexport const remember = (name: string) => String(greet) + name;\n",
      'boundary api-integrations -> api-application',
    ],
  ])('fails when %s', (_label, path, source, finding) => {
    expect(architectureGate({ [path]: source })).toEqual({ status: 1, findings: [finding] });
  });

  it.each([
    [
      'a loose file directly under features composes several features',
      `${WEB}/features/loose.ts`,
      "import { status } from './status';\nimport { nameInput } from './name-input';\nexport const loose = [status, nameInput];\n",
    ],
    [
      'a loose file sits directly under routes',
      `${WEB}/routes/loose.ts`,
      'export const loose = 1;\n',
    ],
    ['the api grows a stray layer', `${API}/utils/format.ts`, 'export const format = 1;\n'],
    [
      'the api hides a stray layer in an etc folder',
      `${API}/etc/format.ts`,
      'export const format = 1;\n',
    ],
    ['the web app grows a stray layer', `${WEB}/utils/format.ts`, 'export const format = 1;\n'],
    ['a new package appears', 'packages/kit/src/index.ts', 'export const kit = 1;\n'],
  ])('fails when %s, a file outside every role', (_label, path, source) => {
    expect(architectureGate({ [path]: source })).toEqual({
      status: 1,
      findings: [`coverage ${path}`],
    });
  });

  it.each([
    [
      'the domain imports tRPC',
      `${GREETING}/domain.ts`,
      "import { initTRPC } from '@trpc/server';\nexport interface Greeting { readonly message: string }\nexport const formatGreeting = (name: string) => String(initTRPC) + name;\n",
      ['policy contract/domain-pure'],
    ],
    [
      'the domain imports Effect',
      `${GREETING}/domain.ts`,
      "import { Schema } from 'effect';\nexport interface Greeting { readonly message: string }\nexport const formatGreeting = (name: string) => String(Schema) + name;\n",
      ['policy contract/domain-pure'],
    ],
    [
      'application logic imports tRPC',
      `${GREETING}/application.ts`,
      "import { TRPCError } from '@trpc/server';\nimport { formatGreeting, type Greeting } from './domain.ts';\nexport const greet = (name: string): Greeting => ({ message: formatGreeting(String(TRPCError) + name) });\n",
      ['policy contract/application-without-trpc'],
    ],
    [
      'application logic calls fetch',
      `${GREETING}/application.ts`,
      "import { formatGreeting, type Greeting } from './domain.ts';\nexport const greet = (name: string): Greeting => { void fetch('https://example.com'); return { message: formatGreeting(name) }; };\n",
      ['policy contract/effects-in-integrations', 'policy contract/io-effects-in-integrations'],
    ],
    [
      'application logic runs an Effect program',
      `${GREETING}/application.ts`,
      "import { Effect } from 'effect';\nimport { formatGreeting, type Greeting } from './domain.ts';\nexport const greet = (name: string): Greeting => ({ message: formatGreeting(Effect.runSync(Effect.succeed(name))) });\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic runs an Effect program through a namespace import',
      `${GREETING}/application.ts`,
      "import * as E from 'effect/Effect';\nimport { formatGreeting, type Greeting } from './domain.ts';\nexport const greet = (name: string): Greeting => ({ message: formatGreeting(E.runSync(E.succeed(name))) });\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic runs an Effect program through a named import',
      `${GREETING}/application.ts`,
      "import { runPromiseExit, succeed } from 'effect/Effect';\nimport { formatGreeting, type Greeting } from './domain.ts';\nexport const greet = (name: string): Greeting => { void runPromiseExit(succeed(name)); return { message: formatGreeting(name) }; };\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic calls globalThis.fetch',
      `${GREETING}/application.ts`,
      "import { formatGreeting, type Greeting } from './domain.ts';\nexport const greet = (name: string): Greeting => { void globalThis.fetch('https://example.com'); return { message: formatGreeting(name) }; };\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic imports Node DNS',
      `${GREETING}/application.ts`,
      "import { lookup } from 'node:dns';\nimport { formatGreeting, type Greeting } from './domain.ts';\nexport const greet = (name: string): Greeting => ({ message: formatGreeting(name + String(lookup)) });\n",
      ['policy contract/node-io-in-integrations'],
    ],
    [
      'application logic opens an HTTPS request',
      `${GREETING}/application.ts`,
      "import { request } from 'node:https';\nimport { formatGreeting, type Greeting } from './domain.ts';\nexport const greet = (name: string): Greeting => { request('https://example.com'); return { message: formatGreeting(name) }; };\n",
      ['policy contract/io-effects-in-integrations', 'policy contract/node-io-in-integrations'],
    ],
    [
      'a procedure imports Node file IO',
      `${GREETING}/procedures.ts`,
      "import { readFileSync } from 'node:fs';\nimport { greet } from './application.ts';\nimport { router } from '../../trpc.ts';\nexport const greetingRouter = router(() => greet(String(readFileSync)));\n",
      ['policy contract/node-io-in-integrations'],
    ],
    [
      'a route calls fetch',
      `${WEB}/routes/greeting/index.ts`,
      "export const greeting = fetch('/trpc/greeting.greet');\n",
      ['policy contract/effects-in-integrations', 'policy contract/io-effects-in-integrations'],
    ],
    [
      'a route wires its own tRPC client',
      `${WEB}/routes/greeting/index.ts`,
      "import { createTRPCClient } from '@trpc/client';\nexport const greeting = createTRPCClient;\n",
      ['policy contract/trpc-client-in-api-client'],
    ],
    [
      'a feature imports the tRPC server',
      `${WEB}/features/name-input/index.ts`,
      "import { TRPCError } from '@trpc/server';\nexport const nameInput = TRPCError;\n",
      ['policy contract/trpc-server-off-the-web'],
    ],
    [
      'a ui primitive imports TanStack Query',
      'packages/ui/src/index.ts',
      "import { useQuery } from '@tanstack/react-query';\nexport const Button = useQuery;\n",
      ['policy contract/ui-without-logic'],
    ],
    [
      'a ui primitive imports React Hook Form',
      'packages/ui/src/index.ts',
      "import { useForm } from 'react-hook-form';\nexport const Button = useForm;\n",
      ['policy contract/ui-without-logic'],
    ],
  ])('fails when %s', (_label, path, source, findings) => {
    expect(architectureGate({ [path]: source })).toEqual({ status: 1, findings });
  });

  it('applies the rule pack to a showcase result, which the workspace lists', () => {
    const showcase = 'showcase/x/api';
    const todo = `${showcase}/src/features/todo`;
    const seed = {
      [`${showcase}/package.json`]:
        '{ "name": "@showcase/x-api", "private": true, "type": "module", "exports": { ".": { "types": "./src/router.ts" } } }\n',
      [`${showcase}/src/router.ts`]:
        "import { todoRouter } from './features/todo/index.ts';\nexport const appRouter = todoRouter;\n",
      [`${todo}/index.ts`]: "export { todoRouter } from './procedures.ts';\n",
      [`${todo}/procedures.ts`]:
        "import { addTodo } from './application.ts';\nexport const todoRouter = addTodo;\n",
      [`${todo}/application.ts`]:
        "import { formatTodo } from './domain.ts';\nexport const addTodo = (title: string) => formatTodo(title);\n",
      [`${todo}/domain.ts`]:
        "import { initTRPC } from '@trpc/server';\nexport const formatTodo = (title: string) => String(initTRPC) + title;\n",
    };
    expect(architectureGate(seed)).toEqual({
      status: 1,
      findings: ['policy contract/domain-pure'],
    });
  });

  it('fails a fallow-ignore suppression that gives no reason', () => {
    const seed = {
      [`${WEB}/routes/greeting/index.ts`]:
        "import { ApiProvider } from '../../api-client';\n// fallow-ignore-next-line boundary-violation\nimport { settings } from '../settings';\nexport const greeting = [ApiProvider, settings];\n",
    };
    const result = withSeededRepository(seed, (directory) =>
      spawnSync(FALLOW_BIN, ['dead-code', '--stale-suppressions', '-q'], {
        cwd: directory,
        encoding: 'utf8',
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('suppression is missing a reason');
  });
});
