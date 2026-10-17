import { globToRegExp, renderRoleDiagram } from './diagram.mjs';

/** Build `fallow viz --viz-format dot` output for the given files and edges. */
function dotFor(files: string[], edges: Array<[string, string]>): string {
  const nodeLines = files.map(
    (file, index) => `  n${index} [label="${file}", fillcolor="#30a46c", fontcolor="#eeeeec"];`,
  );
  const edgeLines = edges.map(
    ([from, to]) => `  n${files.indexOf(from)} -> n${files.indexOf(to)};`,
  );
  return [
    'digraph fallow {',
    '  rankdir=LR;',
    '  node [shape=box, style=filled];',
    '',
    ...nodeLines,
    '',
    ...edgeLines,
    '}',
    '',
  ].join('\n');
}

/** `fallow list --boundaries --format json -q` output, shaped like Fallow 3.33.1. */
const BOUNDARIES = JSON.stringify({
  kind: 'list-boundaries',
  boundaries: {
    configured: true,
    zone_count: 6,
    zones: [
      {
        name: 'web-app',
        patterns: ['{apps,showcase/*}/web/src/main.tsx', '{apps,showcase/*}/web/src/App.tsx'],
        file_count: 2,
      },
      {
        name: 'web-api-client',
        patterns: ['{apps,showcase/*}/web/src/api-client/**'],
        file_count: 2,
      },
      {
        name: 'web-routes/greeting',
        patterns: ['apps/web/src/routes/greeting/**'],
        file_count: 3,
      },
      { name: 'web-routes', patterns: ['{apps,showcase/*}/web/src/routes/*/**'], file_count: 1 },
      { name: 'ui', patterns: ['packages/ui/src/**'], file_count: 2 },
      {
        name: 'api-app',
        patterns: ['{apps,showcase/*}/api/src/{server,router}.ts'],
        file_count: 2,
      },
    ],
    rule_count: 6,
    rules: [],
    logical_group_count: 1,
    logical_groups: [
      {
        name: 'web-routes',
        children: ['web-routes/greeting'],
        auto_discover: ['apps/web/src/routes'],
        status: 'ok',
        source_zone_index: 2,
        file_count: 3,
        authored_rule: { allow: ['web-api-client', 'ui'] },
        fallback_zone: 'web-routes',
      },
    ],
  },
});

const FILES = [
  'apps/web/e2e/greeting.spec.ts',
  'apps/web/index.html',
  'scripts/check-context-layer.mjs',
  'scripts/check-context-layer.test.ts',
  'apps/web/src/App.tsx',
  'apps/web/src/main.tsx',
  'apps/web/src/api-client/index.ts',
  'apps/web/src/api-client/trpc.ts',
  'apps/web/src/routes/greeting/GreetingPage.test.tsx',
  'apps/web/src/routes/greeting/GreetingPage.tsx',
  'apps/web/src/routes/greeting/index.ts',
  'packages/ui/src/Button.tsx',
  'packages/ui/src/index.ts',
  'apps/api/src/router.ts',
  'apps/api/src/server.ts',
  'showcase/todo-01/web/src/routes/todos/TodosPage.tsx',
];

const EDGES: Array<[string, string]> = [
  ['apps/web/index.html', 'apps/web/src/main.tsx'],
  ['scripts/check-context-layer.test.ts', 'scripts/check-context-layer.mjs'],
  ['apps/web/src/main.tsx', 'apps/web/src/App.tsx'],
  ['apps/web/src/main.tsx', 'apps/web/src/api-client/index.ts'],
  ['apps/web/src/App.tsx', 'apps/web/src/routes/greeting/index.ts'],
  ['apps/web/src/routes/greeting/index.ts', 'apps/web/src/routes/greeting/GreetingPage.tsx'],
  ['apps/web/src/routes/greeting/GreetingPage.test.tsx', 'apps/web/src/api-client/index.ts'],
  ['apps/web/src/routes/greeting/GreetingPage.tsx', 'packages/ui/src/index.ts'],
  ['apps/web/src/api-client/index.ts', 'apps/web/src/api-client/trpc.ts'],
  ['apps/web/src/api-client/trpc.ts', 'apps/api/src/router.ts'],
  ['packages/ui/src/index.ts', 'packages/ui/src/Button.tsx'],
  ['apps/api/src/server.ts', 'apps/api/src/router.ts'],
];

const render = (files = FILES, edges = EDGES) =>
  renderRoleDiagram(dotFor(files, edges), BOUNDARIES);

const edgeLines = (diagram: string) => diagram.split('\n').filter((line) => line.includes('-->'));

describe('globToRegExp', () => {
  it('matches a brace-glob zone in the reference and in every showcase result', () => {
    const routes = globToRegExp('{apps,showcase/*}/web/src/routes/**');
    expect(
      [
        'apps/web/src/routes/greeting/GreetingPage.tsx',
        'showcase/todo-01/web/src/routes/todos/TodosPage.tsx',
        'showcase/todo-01/nested/web/src/routes/todos/TodosPage.tsx',
        'packages/web/src/routes/greeting/GreetingPage.tsx',
      ].map((file) => routes.test(file)),
    ).toEqual([true, true, false, false]);
  });

  it('matches a brace list of file names', () => {
    const procedures = globToRegExp('{apps,showcase/*}/api/src/features/*/{index,procedures}.ts');
    expect(
      [
        'apps/api/src/features/greeting/index.ts',
        'apps/api/src/features/greeting/procedures.ts',
        'apps/api/src/features/greeting/domain.ts',
      ].map((file) => procedures.test(file)),
    ).toEqual([true, true, false]);
  });
});

describe('renderRoleDiagram', () => {
  it('collapses files into their roles, using the logical group for child zones', () => {
    expect(edgeLines(render())).toEqual([
      '  web_api_client --> api_app',
      '  web_app --> web_api_client',
      '  web_app --> web_routes',
      '  web_routes --> ui',
      '  web_routes --> web_api_client',
    ]);
  });

  it('declares one node per role, named after the role', () => {
    expect(render()).toContain(
      [
        '  api_app["api-app"]',
        '  ui["ui"]',
        '  web_api_client["web-api-client"]',
        '  web_app["web-app"]',
        '  web_routes["web-routes"]',
        '',
      ].join('\n'),
    );
  });

  it('drops files that belong to no zone', () => {
    const diagram = render();
    expect(diagram).not.toMatch(/index\.html|scripts|e2e/);
  });

  it('dedupes and sorts edges and drops self-edges', () => {
    const reversed = [...EDGES].reverse();
    const doubled: Array<[string, string]> = [
      ...reversed,
      ['apps/web/src/routes/greeting/GreetingPage.tsx', 'packages/ui/src/index.ts'],
    ];
    expect(edgeLines(render(FILES, doubled))).toEqual(edgeLines(render()));
  });

  it('is byte-identical across repeated runs', () => {
    expect(render()).toBe(render());
  });

  it('leaves the output unchanged when a file is added inside an existing role', () => {
    const file = 'apps/web/src/routes/greeting/useGreeting.ts';
    const edges: Array<[string, string]> = [
      ...EDGES,
      ['apps/web/src/routes/greeting/GreetingPage.tsx', file],
      [file, 'apps/web/src/api-client/index.ts'],
    ];
    expect(render([...FILES, file], edges)).toBe(render());
  });

  it('adds exactly one line for a new cross-role edge, from a showcase result too', () => {
    const before = render().split('\n');
    const after = render(FILES, [
      ...EDGES,
      ['showcase/todo-01/web/src/routes/todos/TodosPage.tsx', 'apps/api/src/router.ts'],
    ]).split('\n');
    expect(after.filter((line) => !before.includes(line))).toEqual(['  web_routes --> api_app']);
    expect(after).toHaveLength(before.length + 1);
  });

  it('throws when the dot text has no edges', () => {
    expect(() => render(FILES, [])).toThrow(/no edges/);
  });

  it('throws when the roles have nodes but no edge between them', () => {
    expect(() =>
      render(FILES, [['scripts/check-context-layer.test.ts', 'scripts/check-context-layer.mjs']]),
    ).toThrow(/no import crosses two roles/);
  });

  it('throws when the dot text has no labelled nodes', () => {
    expect(() => renderRoleDiagram('digraph fallow {\n  n0 -> n1;\n}\n', BOUNDARIES)).toThrow(
      /no labelled nodes/,
    );
  });
});
