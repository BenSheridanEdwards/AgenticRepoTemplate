/**
 * @jest-environment node
 */
import { loadContract } from './contract.mjs';
import { loadRepositoryContract } from './temporary-monorepo';

/** `fallow config --format json -q` output, cut to the fields the contract reads. */
const configJson = <Boundaries>(boundaries: Boundaries) =>
  JSON.stringify({ entry: [], rulePacks: [], boundaries });

const ZONES = [
  { name: 'web-app', patterns: ['{apps,showcase/*}/web/src/main.tsx'] },
  { name: 'web-api-client', patterns: ['{apps,showcase/*}/web/src/api-client/**'] },
  {
    name: 'web-routes',
    patterns: ['{apps,showcase/*}/web/src/routes/*/**'],
    autoDiscover: ['apps/web/src/routes'],
  },
  { name: 'ui', patterns: ['packages/ui/src/**'] },
  { name: 'api-app', patterns: ['{apps,showcase/*}/api/src/{server,router}.ts'] },
  { name: 'api-trpc', patterns: ['{apps,showcase/*}/api/src/trpc.ts'] },
  {
    name: 'api-procedures',
    patterns: ['{apps,showcase/*}/api/src/features/*/{index,procedures}.ts'],
  },
  { name: 'api-application', patterns: ['{apps,showcase/*}/api/src/features/*/application.ts'] },
  { name: 'api-domain', patterns: ['{apps,showcase/*}/api/src/features/*/domain.ts'] },
];

const RULES = [
  { from: 'web-app', allow: ['web-routes', 'web-api-client', 'ui'] },
  { from: 'web-api-client', allow: [], allowTypeOnly: ['api-app'] },
  { from: 'web-routes', allow: ['web-api-client', 'ui'] },
  { from: 'ui', allow: [] },
  { from: 'api-app', allow: ['api-trpc', 'api-procedures'] },
  { from: 'api-procedures', allow: ['api-trpc', 'api-application'], allowTypeOnly: ['api-domain'] },
  { from: 'api-application', allow: ['api-domain'] },
];

const contract = loadContract(configJson({ zones: ZONES, rules: RULES }));

describe('loadContract', () => {
  it('lists the roles in declared zone order', () => {
    expect(contract.roles).toEqual(ZONES.map((zone) => zone.name));
  });

  it('gives one direction per allowed role, type-only where the rule says allowTypeOnly', () => {
    expect(contract.directions).toEqual([
      { from: 'web-app', to: 'web-routes', typeOnly: false },
      { from: 'web-app', to: 'web-api-client', typeOnly: false },
      { from: 'web-app', to: 'ui', typeOnly: false },
      { from: 'web-api-client', to: 'api-app', typeOnly: true },
      { from: 'web-routes', to: 'web-api-client', typeOnly: false },
      { from: 'web-routes', to: 'ui', typeOnly: false },
      { from: 'api-app', to: 'api-trpc', typeOnly: false },
      { from: 'api-app', to: 'api-procedures', typeOnly: false },
      { from: 'api-procedures', to: 'api-trpc', typeOnly: false },
      { from: 'api-procedures', to: 'api-application', typeOnly: false },
      { from: 'api-procedures', to: 'api-domain', typeOnly: true },
      { from: 'api-application', to: 'api-domain', typeOnly: false },
    ]);
  });

  it('requires the app, api-client and routes roles for web, and five roles for api', () => {
    expect(contract.requiredRoles).toEqual({
      web: ['web-app', 'web-api-client', 'web-routes'],
      api: ['api-app', 'api-trpc', 'api-procedures', 'api-application', 'api-domain'],
    });
  });

  it('gives each role the kind of package it lives in', () => {
    expect(contract.roles.map((role) => [role, contract.kindOf(role)])).toEqual([
      ['web-app', 'web'],
      ['web-api-client', 'web'],
      ['web-routes', 'web'],
      ['ui', 'ui'],
      ['api-app', 'api'],
      ['api-trpc', 'api'],
      ['api-procedures', 'api'],
      ['api-application', 'api'],
      ['api-domain', 'api'],
    ]);
  });

  it('maps a file of any result to its role, and a file outside every zone to none', () => {
    expect(
      [
        'apps/web/src/main.tsx',
        'showcase/todo-01/web/src/routes/todos/TodosPage.tsx',
        'showcase/todo-01/api/src/features/todos/procedures.ts',
        'packages/ui/src/Button.tsx',
        'apps/api/src/features/greeting/domain.ts',
        'apps/web/e2e/greeting.spec.ts',
        'apps/web/src/routes/loose.ts',
        'scripts/check-suppressions.mjs',
      ].map(contract.roleOf),
    ).toEqual([
      'web-app',
      'web-routes',
      'api-procedures',
      'ui',
      'api-domain',
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('fails on a zone whose name gives no package kind', () => {
    const zones = [...ZONES, { name: 'shared', patterns: ['packages/shared/src/**'] }];
    expect(() => loadContract(configJson({ zones, rules: RULES }))).toThrow(
      /zone "shared".*web-, api- or ui/,
    );
  });

  it('fails when a required role has no zone', () => {
    const zones = ZONES.filter((zone) => zone.name !== 'api-trpc');
    expect(() => loadContract(configJson({ zones, rules: RULES }))).toThrow(
      /required role "api-trpc" has no zone/,
    );
  });

  it('fails when the config has no boundaries', () => {
    expect(() => loadContract(configJson(undefined))).toThrow(/no boundaries/);
  });
});

describe("the repository's contract, read through Fallow", () => {
  const repository = loadRepositoryContract();

  it('has the eleven roles of the role table', () => {
    expect([...repository.roles].sort()).toEqual([
      'api-app',
      'api-application',
      'api-domain',
      'api-integrations',
      'api-procedures',
      'api-trpc',
      'ui',
      'web-api-client',
      'web-app',
      'web-features',
      'web-routes',
    ]);
  });

  it('lets every role except ui reach every other role, by value or by type', () => {
    const reach = new Set(repository.directions.map(({ from, to }) => `${from} ${to}`));
    const missing = repository.roles
      .filter((role: string) => role !== 'ui')
      .flatMap((from: string) =>
        repository.roles
          .filter((to: string) => to !== from && !reach.has(`${from} ${to}`))
          .map((to: string) => `${from} ${to}`),
      );
    expect(missing).toEqual([]);
    expect(repository.directions.filter(({ from, to }) => from === to)).toEqual([]);
  });

  it('lets ui reach no other role, by value or by type', () => {
    expect(repository.directions.filter(({ from }) => from === 'ui')).toEqual([]);
  });

  it('allows value imports along exactly the listed directions', () => {
    const valueDirections = repository.directions
      .filter((direction) => !direction.typeOnly)
      .map(({ from, to }) => `${from} -> ${to}`);
    expect(valueDirections).toEqual([
      'web-app -> web-routes',
      'web-app -> web-api-client',
      'web-app -> ui',
      'web-routes -> web-features',
      'web-routes -> web-api-client',
      'web-routes -> ui',
      'web-features -> web-api-client',
      'web-features -> ui',
      'api-app -> api-trpc',
      'api-app -> api-procedures',
      'api-procedures -> api-trpc',
      'api-procedures -> api-application',
      'api-application -> api-domain',
      'api-application -> api-integrations',
    ]);
    expect(repository.directions).toContainEqual({
      from: 'api-integrations',
      to: 'api-domain',
      typeOnly: true,
    });
  });
});

describe('roleOf', () => {
  it('reads a brace glob as its listed folders and file names only', () => {
    expect(
      [
        'showcase/todo-01/nested/web/src/routes/todos/TodosPage.tsx',
        'packages/web/src/routes/greeting/GreetingPage.tsx',
        'apps/api/src/features/greeting/index.ts',
        'apps/api/src/features/greeting/procedures.ts',
      ].map(contract.roleOf),
    ).toEqual([undefined, undefined, 'api-procedures', 'api-procedures']);
  });
});
