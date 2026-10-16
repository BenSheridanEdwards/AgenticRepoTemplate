import { renderRoleDiagram } from './fallow-roles.mjs';

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
    zone_count: 4,
    zones: [
      {
        name: 'app',
        patterns: ['src/main.tsx', 'src/App.tsx', 'src/index.css'],
        file_count: 3,
      },
      {
        name: 'features/service-status',
        patterns: ['src/features/service-status/**'],
        file_count: 2,
      },
      {
        name: 'features/threshold-counter',
        patterns: ['src/features/threshold-counter/**'],
        file_count: 2,
      },
      { name: 'shared', patterns: ['src/shared/**'], file_count: 2 },
    ],
    rule_count: 4,
    rules: [],
    logical_group_count: 1,
    logical_groups: [
      {
        name: 'features',
        children: ['features/service-status', 'features/threshold-counter'],
        auto_discover: ['src/features'],
        status: 'ok',
        source_zone_index: 1,
        file_count: 4,
        authored_rule: { allow: ['shared'] },
      },
    ],
  },
});

const FILES = [
  'e2e/app.spec.ts',
  'index.html',
  'scripts/check-context-layer.mjs',
  'scripts/check-context-layer.test.ts',
  'src/App.tsx',
  'src/features/service-status/ServiceStatus.test.tsx',
  'src/features/service-status/ServiceStatus.tsx',
  'src/features/service-status/index.ts',
  'src/features/threshold-counter/ThresholdCounter.tsx',
  'src/features/threshold-counter/index.ts',
  'src/index.css',
  'src/main.tsx',
  'src/shared/async-resource/asyncResource.ts',
  'src/shared/async-resource/index.ts',
];

const EDGES: Array<[string, string]> = [
  ['index.html', 'src/main.tsx'],
  ['scripts/check-context-layer.test.ts', 'scripts/check-context-layer.mjs'],
  ['src/App.tsx', 'src/features/service-status/index.ts'],
  ['src/App.tsx', 'src/features/threshold-counter/index.ts'],
  [
    'src/features/service-status/ServiceStatus.test.tsx',
    'src/features/service-status/ServiceStatus.tsx',
  ],
  ['src/features/service-status/ServiceStatus.tsx', 'src/shared/async-resource/index.ts'],
  ['src/features/service-status/index.ts', 'src/features/service-status/ServiceStatus.tsx'],
  [
    'src/features/threshold-counter/index.ts',
    'src/features/threshold-counter/ThresholdCounter.tsx',
  ],
  ['src/main.tsx', 'src/App.tsx'],
  ['src/main.tsx', 'src/index.css'],
  ['src/shared/async-resource/index.ts', 'src/shared/async-resource/asyncResource.ts'],
];

const render = (files = FILES, edges = EDGES) =>
  renderRoleDiagram(dotFor(files, edges), BOUNDARIES);

const edgeLines = (diagram: string) => diagram.split('\n').filter((line) => line.includes('-->'));

describe('renderRoleDiagram', () => {
  it('collapses files into their roles, using the logical group for feature zones', () => {
    expect(edgeLines(render())).toEqual(['  app --> features', '  features --> shared']);
  });

  it('declares one node per role, named after the role', () => {
    expect(render()).toContain('  app["app"]\n  features["features"]\n  shared["shared"]\n');
  });

  it('drops files that belong to no zone', () => {
    const diagram = render();
    expect(diagram).not.toMatch(/index\.html|scripts|e2e/);
  });

  it('dedupes and sorts edges and drops self-edges', () => {
    const reversed = [...EDGES].reverse();
    const doubled: Array<[string, string]> = [
      ...reversed,
      ['src/features/service-status/ServiceStatus.tsx', 'src/shared/async-resource/index.ts'],
    ];
    expect(edgeLines(render(FILES, doubled))).toEqual([
      '  app --> features',
      '  features --> shared',
    ]);
  });

  it('is byte-identical across repeated runs', () => {
    expect(render()).toBe(render());
  });

  it('leaves the output unchanged when a file is added inside an existing role', () => {
    const file = 'src/features/threshold-counter/useThresholdCounter.ts';
    const edges: Array<[string, string]> = [
      ...EDGES,
      ['src/features/threshold-counter/ThresholdCounter.tsx', file],
      [file, 'src/shared/async-resource/index.ts'],
    ];
    expect(render([...FILES, file], edges)).toBe(render());
  });

  it('adds exactly one line for a new cross-role edge', () => {
    const before = render().split('\n');
    const after = render(FILES, [
      ...EDGES,
      ['src/App.tsx', 'src/shared/async-resource/index.ts'],
    ]).split('\n');
    expect(after.filter((line) => !before.includes(line))).toEqual(['  app --> shared']);
    expect(after).toHaveLength(before.length + 1);
  });

  it('throws when the dot text has no edges', () => {
    expect(() => render(FILES, [])).toThrow(/no edges/);
  });

  it('throws when the dot text has no labelled nodes', () => {
    expect(() => renderRoleDiagram('digraph fallow {\n  n0 -> n1;\n}\n', BOUNDARIES)).toThrow(
      /no labelled nodes/,
    );
  });
});
