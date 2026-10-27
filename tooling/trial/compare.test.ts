/**
 * @jest-environment node
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  checkLandedRuns,
  checkRunEvidence,
  comparisonFailures,
  comparisonReport,
  hasTrialEvidence,
  proveBaseline,
  REPORT_PATH,
  renderComparison,
} from './compare.mjs';
import { compareResults, FREEDOMS, UI_PRIMITIVE_FOR } from './dimensions.mjs';
import { readContract, readGateFindings, readResultFacts, treeFromPatch } from './result-facts.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');

/**
 * The trial records, streams, patch and the one showcase diagram the suite uses
 * as test data, kept as byte-for-byte copies under `tooling/trial/fixtures/`, so
 * these tests pass in a rerun scaffold that has removed `docs/trials/` and the
 * old `showcase/` results (ADR 0047). Every other path reads the repository.
 */
const FIXTURE_FOR: Record<string, string> = {
  'docs/trials/todo-01.patch': 'todo-01.patch',
  'docs/trials/todo-01.json': 'todo-01.json',
  'docs/trials/todo-02.json': 'todo-02.json',
  'docs/trials/todo-03.json': 'todo-03.json',
  'docs/trials/todo-01.stream.jsonl': 'todo-01.stream.jsonl',
  'docs/trials/todo-02.stream.jsonl': 'todo-02.stream.jsonl',
  'docs/trials/todo-03.stream.jsonl': 'todo-03.stream.jsonl',
  'showcase/todo-02/architecture.mmd': 'todo-02.architecture.mmd',
};
const read = (path: string) => {
  if (path === 'tooling/trial/todo-prompt.md') {
    const { prompt } = JSON.parse(readFileSync(join(FIXTURES, 'todo-01.json'), 'utf8'));
    return prompt.text.replaceAll('todo-01', '{{ID}}').replace('trial 1 of', 'trial {{N}} of');
  }
  const fixture = FIXTURE_FOR[path];
  return readFileSync(fixture ? join(FIXTURES, fixture) : resolve(ROOT, path), 'utf8');
};
const contract = readContract(read('.fallowrc.jsonc'));
const PATCH = 'docs/trials/todo-01.patch';
const BASE: ReadonlyMap<string, string> = treeFromPatch(read(PATCH), 'showcase/todo-01');

type Tree = Map<string, string>;
type Edit = (tree: Tree) => void;

/** The todo-01 tree under another id, with `edits` applied in order. */
function variant(id: string, ...edits: Edit[]): Tree {
  const tree: Tree = new Map(
    [...BASE].map(([path, text]) => [path, text.replaceAll('todo-01', id)]),
  );
  for (const edit of edits) {
    edit(tree);
  }
  return tree;
}

const factsWith = (id: string, streamText: string | null, ...edits: Edit[]) =>
  readResultFacts({
    id,
    root: `showcase/${id}`,
    passed: true,
    verified: true,
    tree: variant(id, ...edits),
    contract,
    streamText,
  });

const facts = (id: string, ...edits: Edit[]) => factsWith(id, null, ...edits);

const edit =
  (path: string, change: (text: string) => string): Edit =>
  (tree) => {
    const text = tree.get(path);
    if (text === undefined) {
      throw new Error(`no ${path} in the tree`);
    }
    tree.set(path, change(text));
  };

const replaceIn = (path: string, from: string | RegExp, to: string) =>
  edit(path, (text) =>
    typeof from === 'string' ? text.replaceAll(from, to) : text.replace(from, to),
  );

/** Renames a word in every path and every text, the way a run that chose other names would. */
const renameEverywhere =
  (from: RegExp, to: string): Edit =>
  (tree) => {
    const renamed = [...tree].map(([path, text]) => [
      path.replace(from, to),
      text.replace(from, to),
    ]);
    tree.clear();
    for (const [path, text] of renamed) {
      tree.set(path, text);
    }
  };

const remove =
  (path: string): Edit =>
  (tree) => {
    tree.delete(path);
  };

type ToolContent = string | { type: 'text'; text: string }[];
interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

/** The Bash call that printed the real todo-02 finding. */
const GATE_CALL: ToolCall = {
  name: 'Bash',
  input: { command: 'pnpm typecheck && pnpm verify 2>&1 | grep -v "^\\s*$" | tail -60' },
};

/** A stream with one assistant tool call and the user event of its result per content. */
const streamFrom = (call: ToolCall, ...contents: ToolContent[]) =>
  contents
    .flatMap((content, index) => [
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: `t${index}`, ...call }] },
      }),
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: `t${index}`, content }],
        },
      }),
    ])
    .join('\n');

const streamOf = (...contents: ToolContent[]) => streamFrom(GATE_CALL, ...contents);

/** `fallow audit` output naming one unused re-export of `name` in `file`. */
const auditOutput = (file: string, name: string, header = '● Unused type exports (1)') =>
  [
    '── Unused Code ─────────────',
    header,
    `  ${file}`,
    `    :4 ${name} (re-export)`,
    '  Type exports with no known consumers',
    '  https://fallow.tools/docs/explanations/dead-code/#unused-types',
    '── Duplication ─────────────',
  ].join('\n');

const API_CLIENT_INDEX = (id: string) => `showcase/${id}/web/src/api-client/index.ts`;
const flagging = (id: string, name = 'RouterInputs') =>
  streamOf(auditOutput(API_CLIENT_INDEX(id), name));
const withoutRouterInputs = replaceIn(
  'web/etc/api-client.api.md',
  /\/\/ @public \(undocumented\)\r?\nexport type RouterInputs [^\n]*\n/,
  '',
);
const API_CLIENT_EXPORTS = 'public-api · exports web:web-api-client';

const API_REPORT = 'api/etc/api.api.md';
const ROUTES = 'web/src/routes/todos';
const EDGE = 'structure · edge api-procedures -.-> api-domain';
const SOLID_EDGE = 'structure · edge api-procedures --> api-domain';
const SOLID_INTEGRATIONS_EDGE = 'structure · edge api-integrations --> api-domain';
const edgeAdder = (arrow: string) =>
  replaceIn(
    'architecture.mmd',
    '  api_procedures --> api_trpc\n',
    `  api_procedures --> api_trpc\n  api_procedures ${arrow} api_domain\n`,
  );
const addEdge = edgeAdder('-.->');
const addSolidEdge = edgeAdder('-->');

type Comparison = ReturnType<typeof compareResults>;

const departures = (comparison: Comparison) =>
  comparison.differences
    .filter((difference) => difference.classification !== 'identical')
    .map((difference) => [
      difference.key,
      difference.classification,
      'freedom' in difference ? difference.freedom : null,
    ]);

const find = (comparison: Comparison, key: string) => {
  const found = comparison.differences.find((difference) => difference.key === key);
  if (!found) {
    throw new Error(`no difference ${key}`);
  }
  return found;
};

describe('compareResults', () => {
  it('finds every aspect identical in an identical pair', () => {
    const comparison = compareResults([facts('todo-01'), facts('todo-02')]);
    expect(departures(comparison)).toEqual([]);
    expect(comparison.consistent).toBe(true);
    expect(comparison.freedoms.every((freedom) => freedom.cited.length === 0)).toBe(true);
    expect(comparison.differences.length).toBeGreaterThan(50);
  });

  it('treats a pair that differs only by names as identical', () => {
    const renamed = facts(
      'todo-02',
      renameEverywhere(/\btoggle\b/g, 'complete'),
      renameEverywhere(/\bdelete\b/g, 'remove'),
      renameEverywhere(/TodoItem/g, 'Row'),
      renameEverywhere(/TodoList/g, 'Rows'),
      renameEverywhere(/useTodos/g, 'useRows'),
      renameEverywhere(/useTodoForm/g, 'useEntryForm'),
      renameEverywhere(/\bTodo\b/g, 'Entry'),
      renameEverywhere(/TodoIdRequest/g, 'EntryKey'),
      renameEverywhere(/features\/todos/g, 'features/entries'),
      renameEverywhere(/features-todos/g, 'features-entries'),
    );
    const comparison = compareResults([facts('todo-01'), renamed]);
    expect(departures(comparison)).toEqual([]);
    expect(comparison.consistent).toBe(true);
    const written = find(comparison, 'public-api · exports web:web-routes').values;
    expect([...written.values()].map(({ written }) => written)).toEqual(['TodosPage', 'TodosPage']);
  });

  it('recognizes toggle and delete by shape when they are keyed flip and drop', () => {
    const keyed = facts(
      'todo-02',
      replaceIn(API_REPORT, /^toggle:/m, 'flip:'),
      replaceIn(API_REPORT, /^delete:/m, 'drop:'),
    );
    expect(keyed.procedures.map((procedure) => procedure.operation)).toEqual([
      'list',
      'create',
      'toggle',
      'delete',
    ]);
    expect(departures(compareResults([facts('todo-01'), keyed]))).toEqual([]);
  });

  it('marks an extra procedure outside the spec', () => {
    const archive =
      'archive: TRPCMutationProcedure<    {\ninput: {\nreadonly id: string;\n};\noutput: Todo;\nmeta: object;\n}>;\n';
    const extra = facts('todo-02', replaceIn(API_REPORT, /^delete:/m, `${archive}delete:`));
    const comparison = compareResults([facts('todo-01'), extra]);
    expect(departures(comparison)).toEqual([
      ['public-api · operations', 'outside-spec', null],
      ['public-api · unrecognized procedure 1', 'outside-spec', null],
    ]);
    expect(comparison.consistent).toBe(false);
  });

  it('places the type of id under freedom 3 and keeps the id inputs identical', () => {
    const numeric = facts(
      'todo-02',
      replaceIn('api/src/features/todos/domain.ts', 'readonly id: string', 'readonly id: number'),
      replaceIn(API_REPORT, /\bid: string/g, 'id: number'),
    );
    expect(departures(compareResults([facts('todo-01'), numeric]))).toEqual([
      ['public-api · item id type', 'spec-freedom', 3],
    ]);
  });

  it('places the generation of id under freedom 3', () => {
    const counter = facts(
      'todo-02',
      replaceIn(
        'api/src/features/todos/integrations.ts',
        'return randomUUID();',
        'lastId += 1;\n  return String(lastId);',
      ),
      replaceIn(
        'api/src/features/todos/integrations.ts',
        "import { randomUUID } from 'node:crypto';",
        'let lastId = 0;',
      ),
    );
    expect(departures(compareResults([facts('todo-01'), counter]))).toEqual([
      ['conventions · id generation', 'spec-freedom', 3],
    ]);
  });

  it('rejects a different mutation output and tells toggle from delete by name on a tie', () => {
    const returnsItem = facts(
      'todo-02',
      replaceIn(API_REPORT, /output: \{\r?\nid: string;\r?\n\};/, 'output: Todo;'),
    );
    expect(returnsItem.procedures.map((procedure) => procedure.operation)).toEqual([
      'list',
      'create',
      'toggle',
      'delete',
    ]);
    expect(departures(compareResults([facts('todo-01'), returnsItem]))).toEqual([
      ['public-api · delete output', 'outside-spec', null],
    ]);
  });

  it('resolves a named output and drops readonly, so the written forms differ only in the report', () => {
    const named = facts(
      'todo-02',
      replaceIn(API_REPORT, /output: \{\r?\nid: string;\r?\n\};/, 'output: TodoIdRequest;'),
    );
    const inline = facts(
      'todo-03',
      replaceIn(
        API_REPORT,
        /output: \{\r?\nid: string;\r?\n\};/,
        'output: {\nreadonly id: string;\n};',
      ),
    );
    const comparison = compareResults([facts('todo-01'), named, inline]);
    expect(departures(comparison)).toEqual([]);
    expect(
      [...find(comparison, 'public-api · delete output').values.values()].map(
        ({ written }) => written,
      ),
    ).toEqual(['{ id: string; }', 'TodoIdRequest', '{ readonly id: string; }']);
  });

  it('places a missing test under freedom 6', () => {
    const fewer = facts('todo-02', remove('api/src/features/todos/integrations.test.ts'));
    expect(departures(compareResults([facts('todo-01'), fewer]))).toEqual([
      ['structure · tests api-integrations', 'spec-freedom', 6],
    ]);
  });

  it('rejects another split of a role into files and components', () => {
    const split = facts('todo-02', (tree) => {
      tree.set(
        `${ROUTES}/TodoEmpty.tsx`,
        'export function TodoEmpty() {\n  return <p className="todo-note">Empty</p>;\n}\n',
      );
    });
    expect(departures(compareResults([facts('todo-01'), split]))).toEqual([
      ['structure · files web-routes', 'outside-spec', null],
      ['component-boundaries · components web-routes', 'outside-spec', null],
    ]);
  });

  it('rejects a split that moves the same call into a new component of the role', () => {
    const page = `${ROUTES}/TodosPage.tsx`;
    const withId = replaceIn(
      page,
      '<h1 className="app__title">',
      '<h1 id={useId()} className="app__title">',
    );
    const moved = facts(
      'todo-02',
      replaceIn(page, '<h1 className="app__title">Todos</h1>', '<TodoHeading />'),
      (tree) => {
        tree.set(
          `${ROUTES}/TodoHeading.tsx`,
          'export function TodoHeading() {\n  return <h1 id={useId()} className="app__title">Todos</h1>;\n}\n',
        );
      },
    );
    expect(departures(compareResults([facts('todo-01', withId), moved]))).toEqual([
      ['structure · files web-routes', 'outside-spec', null],
      ['component-boundaries · components web-routes', 'outside-spec', null],
    ]);
  });

  it('rejects a different hook split with the same role-wide calls', () => {
    const withId = replaceIn(
      `${ROUTES}/useTodos.ts`,
      'const trpc = useTrpc();',
      'const trpc = useTrpc(); useId();',
    );
    const split = facts(
      'todo-02',
      withId,
      replaceIn(`${ROUTES}/useTodos.ts`, 'useId();', 'useTodoId();'),
      (tree) =>
        tree.set(`${ROUTES}/useTodoId.ts`, 'export function useTodoId() { return useId(); }'),
    );
    const comparison = compareResults([facts('todo-01', withId), split]);
    expect(departures(comparison)).toEqual([
      ['structure · files web-routes', 'outside-spec', null],
      ['conventions · hooks web-routes', 'outside-spec', null],
    ]);
    expect(comparison.consistent).toBe(false);
  });

  it('rejects a nullable toggle output', () => {
    const nullable = facts(
      'todo-02',
      replaceIn(API_REPORT, /(toggle:[\s\S]*?output: Todo);/, '$1 | null;'),
    );
    const comparison = compareResults([facts('todo-01'), nullable]);
    expect(departures(comparison)).toEqual([['public-api · toggle output', 'outside-spec', null]]);
    expect(comparison.consistent).toBe(false);
  });

  it.each([2, 4] as const)('rejects an author ruling reinstating revoked freedom %p', (freedom) => {
    expect(() =>
      compareResults(
        [facts('todo-01'), facts('todo-02', addSolidEdge)],
        [{ key: SOLID_EDGE, freedom, why: 'accept the difference' }],
      ),
    ).toThrow('revoked by ADR 0069');
  });

  it('marks another call in a feature hook outside the spec', () => {
    const effect = facts(
      'todo-02',
      replaceIn(
        `${ROUTES}/useTodos.ts`,
        'const trpc = useTrpc();',
        'const trpc = useTrpc();\n  useEffect(() => {}, []);',
      ),
    );
    expect(departures(compareResults([facts('todo-01'), effect]))).toEqual([
      ['conventions · hooks web-routes', 'outside-spec', null],
    ]);
  });

  it('marks another @repo/ui primitive in a feature component outside the spec', () => {
    const item = `${ROUTES}/TodoItem.tsx`;
    const field = facts(
      'todo-02',
      replaceIn(
        item,
        "import { Button } from '@repo/ui';",
        "import { Button, TextField } from '@repo/ui';",
      ),
      replaceIn(
        item,
        '      <Button aria-label',
        '      <TextField label="Note" />\n      <Button aria-label',
      ),
    );
    expect(departures(compareResults([facts('todo-01'), field]))).toEqual([
      ['component-boundaries · components web-routes', 'outside-spec', null],
    ]);
  });

  it('marks an extra solid role edge outside the spec', () => {
    const comparison = compareResults([facts('todo-01'), facts('todo-03', addSolidEdge)]);
    expect(departures(comparison)).toEqual([[SOLID_EDGE, 'outside-spec', null]]);
    expect(find(comparison, SOLID_EDGE).why).toMatch(/role edges/);
  });

  it('places an extra dashed role edge, a type-only import, under freedom 8', () => {
    const comparison = compareResults([facts('todo-01'), facts('todo-03', addEdge)]);
    expect(departures(comparison)).toEqual([[EDGE, 'spec-freedom', 8]]);
    expect(comparison.consistent).toBe(true);
  });

  it('keeps an extra dashed role edge outside the spec when a run failed its verify check', () => {
    const unverified = { ...facts('todo-03', addEdge), verified: false };
    const comparison = compareResults([facts('todo-01'), unverified]);
    expect(departures(comparison)).toEqual([[EDGE, 'outside-spec', null]]);
  });

  const INTEGRATIONS = 'api/src/features/todos/integrations.ts';
  const TYPE_EDGE = 'structure · edge api-integrations -.-> api-domain';
  const ownTodoType = [
    replaceIn('architecture.mmd', '  api_integrations --> api_domain\n', ''),
    replaceIn(INTEGRATIONS, /\bTodo\b/g, 'StoredTodo'),
    replaceIn(
      INTEGRATIONS,
      "import type { StoredTodo } from './domain.ts';\n",
      'interface StoredTodo { readonly id: string; readonly title: string; readonly completed: boolean }\n',
    ),
  ];

  it.each([
    ['`import type`', null],
    [
      'an inline `type` specifier',
      replaceIn(INTEGRATIONS, 'import type { Todo }', 'import { type Todo }'),
    ],
    [
      '`export type … from`',
      replaceIn(
        INTEGRATIONS,
        "import type { Todo } from './domain.ts';",
        "import type { Todo } from './domain.ts';\nexport type { Todo as StoredTodo } from './domain.ts';",
      ),
    ],
  ])('places a solid edge on a value direction that only one run has, carrying only %s, under freedom 8', (_, change) => {
    const typeOnly = change ? facts('todo-01', change) : facts('todo-01');
    const comparison = compareResults([typeOnly, facts('todo-03', ...ownTodoType)]);
    expect(departures(comparison)).toEqual([[TYPE_EDGE, 'spec-freedom', 8]]);
    expect(comparison.consistent).toBe(true);
  });

  it.each([
    [
      'a value import beside it',
      replaceIn(INTEGRATIONS, 'import type { Todo }', 'import { newTodo, type Todo }'),
    ],
    [
      'a dynamic import beside it',
      edit(
        INTEGRATIONS,
        (text) => `${text}\nexport const loadDomain = () => import('./domain.ts');\n`,
      ),
    ],
    [
      'an `export * from`',
      replaceIn(
        INTEGRATIONS,
        "import type { Todo } from './domain.ts';",
        "import type { Todo } from './domain.ts';\nexport * from './domain.ts';",
      ),
    ],
  ])('keeps a solid edge that only one run has outside the spec with %s', (_, change) => {
    const comparison = compareResults([facts('todo-01', change), facts('todo-03', ...ownTodoType)]);
    expect(departures(comparison)).toEqual([[SOLID_INTEGRATIONS_EDGE, 'outside-spec', null]]);
  });

  it.each([
    'seed.js',
    'seed.mjs',
    'seed.mts',
    'seed.cts',
    'seed.jsx',
  ])('keeps a solid edge that only one run has outside the spec with a value import in an integrations/%s file beside it', (file) => {
    const seed: Edit = (tree) => {
      tree.set(
        `api/src/features/todos/integrations/${file}`,
        "import { newTodo } from '../domain.js';\nexport const seed = newTodo;\n",
      );
    };
    const comparison = compareResults([facts('todo-01', seed), facts('todo-03', ...ownTodoType)]);
    expect(departures(comparison)).toEqual([
      [SOLID_INTEGRATIONS_EDGE, 'outside-spec', null],
      ['structure · files api-integrations', 'outside-spec', null],
    ]);
  });

  it('keeps a type-only solid edge that only one run has outside the spec when a run failed its verify check', () => {
    const unverified = { ...facts('todo-03', ...ownTodoType), verified: false };
    const comparison = compareResults([facts('todo-01'), unverified]);
    expect(departures(comparison)).toEqual([[TYPE_EDGE, 'outside-spec', null]]);
  });

  it('places a re-export the run dropped after its own stream flagged it under freedom 9', () => {
    const dropped = factsWith('todo-02', flagging('todo-02'), withoutRouterInputs);
    const comparison = compareResults([facts('todo-01'), dropped, facts('todo-03')]);
    expect(departures(comparison)).toEqual([[API_CLIENT_EXPORTS, 'spec-freedom', 9]]);
    expect(comparison.freedoms[8]?.cited).toEqual([API_CLIENT_EXPORTS]);
  });

  it.each([
    ['no stream', null],
    ['a stream that flags another name', flagging('todo-02', 'RouterOutputs')],
    ["a stream that flags another result's file", flagging('todo-01')],
    [
      'a printf that echoes the finding',
      streamFrom(
        { name: 'Bash', input: { command: "printf '● Unused type exports (1)'" } },
        auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs'),
      ),
    ],
    [
      'the finding in the result of another tool',
      streamFrom(
        { name: 'Read', input: { file_path: 'pnpm verify.log' } },
        auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs'),
      ),
    ],
    [
      'a flag on a file of the role other than its entry',
      streamOf(auditOutput('showcase/todo-02/web/src/api-client/trpc.ts', 'RouterInputs')),
    ],
  ])('keeps a dropped re-export outside the spec with %s', (_, streamText) => {
    const dropped = factsWith('todo-02', streamText, withoutRouterInputs);
    expect(departures(compareResults([facts('todo-01'), dropped]))).toEqual([
      [API_CLIENT_EXPORTS, 'outside-spec', null],
    ]);
  });

  it('keeps a dropped export of a report compared by kind counts outside the spec when the flag sits on an internal file', () => {
    const withTodoInput = replaceIn(
      'api/etc/features-todos.api.md',
      '// (No @packageDocumentation',
      '// @public (undocumented)\nexport type TodoInput = string;\n\n// (No @packageDocumentation',
    );
    const internal = streamOf(
      auditOutput('showcase/todo-02/api/src/features/todos/procedures.ts', 'TodoInput'),
    );
    const comparison = compareResults([
      facts('todo-01', withTodoInput),
      factsWith('todo-02', internal),
      facts('todo-03', withTodoInput),
    ]);
    expect(departures(comparison)).toEqual([
      ['public-api · exports api:api-procedures', 'outside-spec', null],
    ]);
  });

  it('keeps an aspect outside the spec under an author note without a freedom, with the note as its why', () => {
    const comparison = compareResults(
      [facts('todo-01'), facts('todo-03', addSolidEdge)],
      [{ key: SOLID_EDGE, why: 'the agent typed a return' }],
    );
    expect(find(comparison, SOLID_EDGE)).toMatchObject({
      classification: 'outside-spec',
      why: 'the agent typed a return',
      by: 'note',
    });
    expect(comparison.consistent).toBe(false);
    expect(comparison.freedoms.every((freedom) => freedom.cited.length === 0)).toBe(true);
  });

  it('erases the own hook names before it sorts the calls', () => {
    const named = (id: string, hook: string) =>
      facts(
        id,
        renameEverywhere(/useTodos\b/g, hook),
        replaceIn(
          `${ROUTES}/TodosPage.tsx`,
          'export function TodosPage() {',
          'export function TodosPage() {\n  const headingId = useId();',
        ),
      );
    expect(
      departures(compareResults([named('todo-01', 'useAaa'), named('todo-02', 'useZzz')])),
    ).toEqual([]);
  });

  it('reads components wrapped in memo, React.memo and forwardRef', () => {
    const wrapped = facts('todo-02', (tree) => {
      tree.set(
        `${ROUTES}/TodoSearch.tsx`,
        'import { memo } from \'react\';\n\nexport const TodoSearch = memo(function TodoSearch() {\n  return <input type="text" aria-label="Search" />;\n});\n',
      );
      tree.set(`${ROUTES}/TodoCount.tsx`, 'export const TodoCount = React.memo(() => <p>0</p>);\n');
      tree.set(
        `${ROUTES}/TodoField.tsx`,
        'export const TodoField = forwardRef((props, ref) => <p ref={ref}>{props.text}</p>);\n',
      );
    });
    expect(wrapped.components.map((component) => component.name)).toEqual(
      expect.arrayContaining(['TodoSearch', 'TodoCount', 'TodoField']),
    );
    expect(departures(compareResults([facts('todo-01'), wrapped]))).toContainEqual([
      'component-boundaries · ui controls',
      'outside-spec',
      null,
    ]);
  });

  it('holds the scaffold roles fixed and every role to the ui primitives', () => {
    const app = facts(
      'todo-02',
      replaceIn(
        'web/src/App.tsx',
        /$/,
        '\nexport function Reset() {\n  return <button type="button">Reset</button>;\n}\n',
      ),
    );
    expect(departures(compareResults([facts('todo-01'), app]))).toEqual([
      ['component-boundaries · ui controls', 'outside-spec', null],
      ['component-boundaries · components web-app', 'outside-spec', null],
    ]);
  });

  it('compares a file outside every role by its text', () => {
    const changed = facts('todo-02', replaceIn('web/vite.config.ts', 'port: 5173', 'port: 5174'));
    const comparison = compareResults([facts('todo-01'), changed, facts('todo-03')]);
    expect(departures(comparison)).toEqual([
      ['structure · file web/vite.config.ts', 'outside-spec', null],
    ]);
    expect(find(comparison, 'structure · file web/vite.config.ts').why).toContain('`todo-02`');
    expect(find(comparison, 'structure · file web/index.html').classification).toBe('identical');
  });

  it('places a change inside the title of web/index.html under freedom 5', () => {
    const titled = facts('todo-02', replaceIn('web/index.html', /<title>[^<]*</, '<title>Tasks<'));
    expect(departures(compareResults([facts('todo-01'), titled]))).toEqual([
      ['structure · file web/index.html', 'spec-freedom', 5],
    ]);
  });

  it('reads a constant list as no storage and a mutated one as storage', () => {
    const constant = facts(
      'todo-02',
      replaceIn(
        'api/src/features/todos/domain.ts',
        /^/,
        "export const TODO_FIELDS = ['id', 'title', 'completed'];\n\n",
      ),
    );
    expect(departures(compareResults([facts('todo-01'), constant]))).toEqual([]);
    const mutated = facts(
      'todo-02',
      replaceIn(
        'api/src/features/todos/application.ts',
        'export interface CreateTodoRequest',
        'const seen: string[] = [];\n\nexport function remember(id: string) {\n  seen.push(id);\n}\n\nexport interface CreateTodoRequest',
      ),
    );
    expect(departures(compareResults([facts('todo-01'), mutated]))).toEqual([
      ['conventions · storage role', 'outside-spec', null],
    ]);
  });

  it('compares the export names of a scaffold role', () => {
    const swapped = facts(
      'todo-02',
      replaceIn('web/etc/api-client.api.md', 'export type RouterInputs', 'export type RouterArgs'),
    );
    expect(departures(compareResults([facts('todo-01'), swapped]))).toEqual([
      ['public-api · exports web:web-api-client', 'outside-spec', null],
    ]);
  });

  it('places the test count under freedom 6 only when every verify check exited 0', () => {
    const fewer = facts('todo-02', remove('api/src/features/todos/integrations.test.ts'));
    const comparison = compareResults([{ ...facts('todo-01'), verified: false }, fewer]);
    expect(departures(comparison)).toEqual([
      ['structure · tests api-integrations', 'outside-spec', null],
    ]);
    expect(
      find(compareResults([facts('todo-01'), fewer]), 'structure · tests api-integrations').why,
    ).toBe("the test count beyond the gates; every run's `verify` check exited `0`");
  });

  it('marks an added dependency outside the spec', () => {
    const added = facts(
      'todo-02',
      replaceIn(
        'web/package.json',
        '"effect": "^3.22.3",',
        '"effect": "^3.22.3",\n    "lodash": "^4.17.21",',
      ),
    );
    expect(departures(compareResults([facts('todo-01'), added]))).toEqual([
      ['dependencies · web dependencies lodash', 'outside-spec', null],
    ]);
  });

  it('holds form controls to @repo/ui where a primitive exists', () => {
    const raw = facts(
      'todo-02',
      replaceIn(`${ROUTES}/TodoItem.tsx`, '<Button aria-label', '<button aria-label'),
      replaceIn(`${ROUTES}/TodoItem.tsx`, '</Button>', '</button>'),
    );
    expect(departures(compareResults([facts('todo-01'), raw]))).toEqual([
      ['component-boundaries · ui controls', 'outside-spec', null],
      ['component-boundaries · components web-routes', 'outside-spec', null],
    ]);
  });

  it('holds storage to api-integrations', () => {
    const cached = facts(
      'todo-02',
      replaceIn(
        'api/src/features/todos/application.ts',
        'export interface CreateTodoRequest',
        'const cache = new Map<string, Todo>();\n\nexport interface CreateTodoRequest',
      ),
    );
    expect(departures(compareResults([facts('todo-01'), cached]))).toEqual([
      ['conventions · storage role', 'outside-spec', null],
    ]);
  });

  it('holds server state to use* hooks', () => {
    const inComponent = facts(
      'todo-02',
      replaceIn(
        `${ROUTES}/TodosPage.tsx`,
        'const { todos,',
        'const stray = useQuery({ queryKey: [] });\n  const { todos,',
      ),
    );
    expect(departures(compareResults([facts('todo-01'), inComponent]))).toContainEqual([
      'conventions · server state',
      'outside-spec',
      null,
    ]);
  });

  it('leaves an operation that shape and name leave open unrecognized, until a ruling names a freedom', () => {
    const open = (tree: Tree) => {
      replaceIn(API_REPORT, /output: \{\r?\nid: string;\r?\n\};/, 'output: Todo;')(tree);
      replaceIn(API_REPORT, /^toggle:/m, 'flip:')(tree);
      replaceIn(API_REPORT, /^delete:/m, 'drop:')(tree);
    };
    const unclear = facts('todo-02', open);
    expect(unclear.procedures.map((procedure) => procedure.operation)).toEqual([
      'list',
      'create',
      null,
      null,
    ]);
    const pair = [facts('todo-01'), unclear];
    expect(find(compareResults(pair), 'public-api · operations').classification).toBe(
      'outside-spec',
    );
    const ruled = compareResults(pair, [
      { key: 'public-api · operations', freedom: 1, why: 'the keys name the operations' },
    ]);
    expect(find(ruled, 'public-api · operations')).toMatchObject({
      classification: 'spec-freedom',
      freedom: 1,
      by: 'ruling',
    });
  });

  it('throws on a stale ruling or note', () => {
    const pair = [facts('todo-01'), facts('todo-02')];
    expect(() => compareResults(pair, [{ key: EDGE, why: 'x' }])).toThrow(EDGE);
    expect(() =>
      compareResults(pair, [{ key: 'public-api · missing', freedom: 2, why: 'x' }]),
    ).toThrow('public-api · missing');
    expect(() =>
      compareResults(pair, [{ key: 'public-api · operations', freedom: 2, why: 'x' }]),
    ).toThrow('public-api · operations');
  });

  it.each([99, 0, 2.5])('throws on a ruling that names freedom %p, which the list lacks', (n) => {
    const pair = [facts('todo-01'), facts('todo-03', addSolidEdge)];
    const ruling = { key: SOLID_EDGE, freedom: n as 1, why: 'x' };
    expect(() => compareResults(pair, [ruling])).toThrow(SOLID_EDGE);
  });

  it('keeps an optional item field in the item shape, so the item shape breaks', () => {
    const optional = facts(
      'todo-02',
      replaceIn(
        'api/src/features/todos/domain.ts',
        'readonly title: string',
        'readonly title?: string',
      ),
    );
    const comparison = compareResults([facts('todo-01'), optional]);
    const shape = find(comparison, 'public-api · item shape');
    expect(shape.classification).toBe('outside-spec');
    expect(shape.values.get('todo-02')?.written).toContain('title?: string');
    expect(comparison.consistent).toBe(false);
  });

  it.each([
    [
      'a subscription',
      'changes: TRPCSubscriptionProcedure<    {\ninput: void;\noutput: Todo;\nmeta: object;\n}>;\n',
    ],
    [
      'a member of an unknown type',
      'ping: SomethingElse<    {\ninput: void;\noutput: Todo;\nmeta: object;\n}>;\n',
    ],
    ['a member that is no type reference', 'extra: object;\n'],
  ])('records %s in the router, so the operations break', (_, member) => {
    const extra = facts('todo-02', replaceIn(API_REPORT, /^delete:/m, `${member}delete:`));
    const comparison = compareResults([facts('todo-01'), extra]);
    expect(find(comparison, 'public-api · operations').classification).toBe('outside-spec');
    expect(find(comparison, 'public-api · unrecognized procedure 1').classification).toBe(
      'outside-spec',
    );
    expect(comparison.consistent).toBe(false);
  });

  it('holds the form to an Effect schema behind standardSchemaResolver', () => {
    const resolver = (call: string) =>
      replaceIn(`${ROUTES}/useTodoForm.ts`, 'effectTsResolver(todoFormSchema)', call);
    const effect = facts(
      'todo-02',
      resolver('standardSchemaResolver(Schema.toStandardSchemaV1(todoFormSchema))'),
    );
    const otherSchema = facts('todo-03', resolver('standardSchemaResolver(todoFormSchema)'));
    expect(effect.hooks.find((hook) => hook.name === 'useTodoForm')?.calls).toEqual([
      'standardSchemaResolver',
      'toStandardSchemaV1',
      'useForm',
    ]);
    const oneForm = (pair: Parameters<typeof compareResults>[0]) =>
      find(compareResults(pair), 'conventions · one form').classification;
    expect(oneForm([facts('todo-01'), effect])).toBe('identical');
    expect(oneForm([effect, otherSchema])).toBe('outside-spec');
  });

  it('reads a hook called as a property, such as React.useState', () => {
    const local = facts(
      'todo-02',
      replaceIn(
        `${ROUTES}/TodoForm.tsx`,
        '  const { register,',
        '  const [n] = React.useState(0);\n  const { register,',
      ),
    );
    expect(
      find(compareResults([facts('todo-01'), local]), 'conventions · local state').classification,
    ).toBe('outside-spec');
  });

  it('takes the no-input query whose output is an array as the list', () => {
    const count =
      'count: TRPCQueryProcedure<    {\ninput: void;\noutput: number;\nmeta: object;\n}>;\n';
    const extra = facts('todo-02', replaceIn(API_REPORT, /^list:/m, `${count}list:`));
    expect(departures(compareResults([facts('todo-01'), extra]))).toEqual([
      ['public-api · operations', 'outside-spec', null],
      ['public-api · unrecognized procedure 1', 'outside-spec', null],
    ]);
  });

  it('judges an invariant in each run, so one broken in all three stays outside the spec', () => {
    const broken = (id: string) =>
      facts(
        id,
        replaceIn(`${ROUTES}/TodoForm.tsx`, '<Button type="submit">', '<button type="submit">'),
        replaceIn(`${ROUTES}/TodoForm.tsx`, '</Button>', '</button>'),
      );
    const comparison = compareResults([broken('todo-01'), broken('todo-02'), broken('todo-03')]);
    expect(find(comparison, 'component-boundaries · ui controls').classification).toBe(
      'outside-spec',
    );
  });
});

describe('treeFromPatch', () => {
  const patch = [
    'From abc Mon Sep 17 00:00:00 2001',
    'Subject: [PATCH] add',
    '---',
    'diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml',
    'index 1..2 100644',
    '--- a/pnpm-lock.yaml',
    '+++ b/pnpm-lock.yaml',
    '@@ -1,2 +1,3 @@',
    ' a',
    '+b',
    ' c',
    'diff --git a/showcase/x/a.txt b/showcase/x/a.txt',
    'new file mode 100644',
    'index 0000000..1',
    '--- /dev/null',
    '+++ b/showcase/x/a.txt',
    '@@ -0,0 +1,2 @@',
    '+one',
    '+two',
    'diff --git a/showcase/x/b/c.txt b/showcase/x/b/c.txt',
    'new file mode 100644',
    'index 0000000..1',
    '--- /dev/null',
    '+++ b/showcase/x/b/c.txt',
    '@@ -0,0 +1 @@',
    '+-- last',
    '\\ No newline at end of file',
    '-- ',
    '2.47.3',
    '',
  ].join('\n');

  it('reads the new files under the root and skips the rest', () => {
    expect([...treeFromPatch(patch, 'showcase/x')]).toEqual([
      ['a.txt', 'one\ntwo\n'],
      ['b/c.txt', '-- last'],
    ]);
  });

  it('throws on a changed file under the root', () => {
    expect(() =>
      treeFromPatch(
        patch.replace(
          'new file mode 100644\nindex 0000000..1\n--- /dev/null\n+++ b/showcase/x/a.txt',
          'index 1..2 100644\n--- a/showcase/x/a.txt\n+++ b/showcase/x/a.txt',
        ),
        'showcase/x',
      ),
    ).toThrow('showcase/x/a.txt');
  });

  it('reads the committed todo-01 patch', () => {
    expect(BASE.size).toBe(46);
    expect(BASE.get('architecture.mmd')).toBe(
      read('showcase/todo-02/architecture.mmd').replaceAll('todo-02', 'todo-01'),
    );
  });
});

describe('readResultFacts', () => {
  it('keeps only the flagged re-exports the entry of their report no longer exports', () => {
    const index = API_CLIENT_INDEX('todo-02');
    const stream = streamOf(
      auditOutput(index, 'RouterInputs'),
      auditOutput(index, 'RouterOutputs'),
    );
    expect(factsWith('todo-02', stream, withoutRouterInputs).flaggedReExports).toEqual([
      { key: 'web:web-api-client', name: 'RouterInputs', kind: 'type' },
    ]);
  });

  const todo01 = facts('todo-01');

  it('reads the procedures and the item from the API report and the api sources', () => {
    expect(todo01.procedures.map(({ path, kind, operation }) => [path, kind, operation])).toEqual([
      ['todos.list', 'query', 'list'],
      ['todos.create', 'mutation', 'create'],
      ['todos.toggle', 'mutation', 'toggle'],
      ['todos.delete', 'mutation', 'delete'],
    ]);
    expect(todo01.item?.shape).toEqual([
      ['completed', 'boolean'],
      ['id', 'string'],
      ['title', 'string'],
    ]);
  });

  it('keys the API reports by package and role', () => {
    expect(todo01.apiReports.map((report) => report.key)).toEqual([
      'api:api-app',
      'api:api-procedures',
      'web:web-api-client',
      'web:web-routes',
    ]);
  });

  it('reads the components, hooks, storage and id generation', () => {
    expect(
      todo01.components.map(({ name, role, uiPrimitives, rawControls }) => [
        name,
        role,
        uiPrimitives,
        rawControls,
      ]),
    ).toEqual([
      ['App', 'web-app', [], []],
      ['ApiProvider', 'web-api-client', [], []],
      ['TestApiProvider', 'web-api-client', [], []],
      ['TodoForm', 'web-routes', ['Button', 'TextField'], []],
      ['TodoItem', 'web-routes', ['Button'], ['input:checkbox']],
      ['TodoList', 'web-routes', [], []],
      ['TodosPage', 'web-routes', [], []],
    ]);
    expect(todo01.hooks.map(({ name, calls }) => [name, calls])).toEqual([
      ['useTestApiClients', ['useState']],
      ['useTodoForm', ['effectTsResolver', 'useForm']],
      [
        'useTodos',
        ['useMutation', 'useMutation', 'useMutation', 'useQuery', 'useQueryClient', 'useTrpc'],
      ],
    ]);
    expect(todo01.storage).toEqual({ roles: ['api-integrations'], idSource: 'randomUUID' });
  });
});

const evidence = (id: string) => JSON.parse(read(`docs/trials/${id}.json`));

describe('agent and task comparison baselines', () => {
  const records = () =>
    ['todo-01', 'todo-02', 'todo-03'].map((id, index) => {
      const record = evidence(id);
      record.schema = 2;
      record.agent.name = index === 2 ? 'codex' : 'claude';
      record.agent.cli = record.agent.name;
      record.agent.argv = [record.agent.name, '--session-id', record.agent.sessionId];
      record.task = {
        name: 'todo',
        definitionSha256: 'b'.repeat(64),
        target: null,
        checks: ['install', 'verify', 'e2e', 'structure'],
        land: 'showcase',
      };
      if (index === 2)
        Object.assign(record.agent, {
          version: 'codex 0.163',
          resolvedModel: 'gpt-6.1-sol',
          userConfigSha256: 'c'.repeat(64),
        });
      return record;
    });
  it('allows agent fields to differ across agents while proving equality within each agent', () => {
    const checks = proveBaseline(records(), read);
    expect(
      checks
        .filter(({ label }) =>
          [
            'CLI version',
            'Resolved model',
            'User config SHA-256',
            'Agent CLI',
            'Agent argv',
          ].includes(label),
        )
        .every(({ holds }) => holds),
    ).toBe(true);
  });
  it('rejects a model difference within one agent and a scaffold difference across agents', () => {
    const changed = records();
    changed[1].agent.resolvedModel = 'different';
    changed[2].scaffold.rev = 'f'.repeat(40);
    const checks = proveBaseline(changed, read);
    expect(checks.find(({ label }) => label === 'Resolved model')?.holds).toBe(false);
    expect(checks.find(({ label }) => label === 'Scaffold rev')?.holds).toBe(false);
  });
  it('rejects a changed task definition across agents', () => {
    const changed = records();
    changed[2].task.definitionSha256 = 'f'.repeat(64);
    expect(
      proveBaseline(changed, read).find(({ label }) => label === 'Task target and checks')?.holds,
    ).toBe(false);
  });
  it('leaves external tasks out of the Todo evidence state', () => {
    const root = mkdtempSync(join(tmpdir(), 'compare-task-'));
    try {
      mkdirSync(join(root, 'docs/trials'), { recursive: true });
      writeFileSync(
        join(root, 'docs/trials/other-01.json'),
        JSON.stringify({ schema: 2, task: { name: 'other' } }),
      );
      expect(hasTrialEvidence(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('readGateFindings', () => {
  const ESC = '\u001b';

  it('reads the unused re-exports of both content shapes, with the kind of their section', () => {
    const ansi = `${ESC}[1m● Unused exports (2)${ESC}[0m\n  ${ESC}[36mshowcase/todo-02/web/src/api-client/index.ts${ESC}[0m\n    :2 TestApiProvider (re-export)\n    :3 helper\n`;
    const stream = streamOf(
      [{ type: 'text', text: auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs') }],
      ansi,
      auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs'),
    );
    expect(readGateFindings(stream, 'showcase/todo-02')).toEqual([
      { file: 'web/src/api-client/index.ts', name: 'RouterInputs', kind: 'type' },
      { file: 'web/src/api-client/index.ts', name: 'TestApiProvider', kind: 'value' },
    ]);
  });

  it('reads gate findings from completed Codex command output', () => {
    const stream = JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'command_execution',
        command: "/bin/bash -lc 'pnpm verify'",
        aggregated_output: auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs'),
        exit_code: 0,
      },
    });
    expect(readGateFindings(stream, 'showcase/todo-02')).toEqual([
      { file: 'web/src/api-client/index.ts', name: 'RouterInputs', kind: 'type' },
    ]);
  });

  it('reads output with CRLF line endings', () => {
    const crlf = auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs').replaceAll('\n', '\r\n');
    expect(readGateFindings(streamOf(crlf), 'showcase/todo-02')).toEqual([
      { file: 'web/src/api-client/index.ts', name: 'RouterInputs', kind: 'type' },
    ]);
  });

  it.each([
    ['printf', { name: 'Bash', input: { command: "printf '%s' 'RouterInputs (re-export)'" } }],
    ['a tool other than Bash', { name: 'Grep', input: { pattern: 'pnpm verify' } }],
    ['a Bash call with no command', { name: 'Bash', input: {} }],
  ])('reads nothing from the result of %s', (_, call) => {
    const stream = streamFrom(call, auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs'));
    expect(readGateFindings(stream, 'showcase/todo-02')).toEqual([]);
  });

  it.each([
    'pnpm verify',
    'pnpm run fallow:audit',
    'npx fallow audit --format human',
    'cd x && fallow dead-code',
  ])('reads the result of the gate command %p', (command) => {
    const stream = streamFrom(
      { name: 'Bash', input: { command } },
      auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs'),
    );
    expect(readGateFindings(stream, 'showcase/todo-02')).toHaveLength(1);
  });

  it("skips the files of another result's root and the findings of other sections", () => {
    const stream = streamOf(
      auditOutput(API_CLIENT_INDEX('todo-01'), 'RouterInputs'),
      auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs', '● Unused files (1)'),
    );
    expect(readGateFindings(stream, 'showcase/todo-02')).toEqual([]);
    expect(readGateFindings(null, 'showcase/todo-02')).toEqual([]);
  });
});

describe('renderComparison', () => {
  const EDITS: Record<string, Edit[]> = { 'todo-02': [withoutRouterInputs], 'todo-03': [addEdge] };
  const STREAMS: Record<string, string> = { 'todo-02': flagging('todo-02') };
  const runs = (
    change: (records: ReturnType<typeof evidence>[]) => void = () => undefined,
    streams = STREAMS,
  ) => {
    const records = ['todo-01', 'todo-02', 'todo-03'].map(evidence);
    change(records);
    return records.map((record) => ({
      evidence: record,
      source: record.result.patch ?? `showcase/${record.trial.id}`,
      facts: {
        ...factsWith(
          record.trial.id,
          streams[record.trial.id] ?? null,
          ...(EDITS[record.trial.id] ?? []),
        ),
        passed: record.result.status === 'passed',
      },
    }));
  };
  const verdict = (report: string) => report.split('## Verdict\n\n')[1]?.split('\n\n')[0] ?? '';

  it('shows modern runs side by side and excludes foreign tasks from the report', () => {
    const modern = runs((records) =>
      records.forEach((record, index) => {
        record.schema = 2;
        record.task = {
          name: 'todo',
          definitionSha256: 'b'.repeat(64),
          target: null,
          checks: ['install', 'verify', 'e2e', 'structure'],
          land: 'showcase',
        };
        record.agent.name = index === 2 ? 'codex' : 'claude';
        if (index === 2) record.agent.resolvedModel = 'gpt-6.1-sol';
      }),
    );
    const foreign = {
      ...modern[0],
      evidence: {
        ...modern[0].evidence,
        task: { ...modern[0].evidence.task, name: 'foreign-task' },
        trial: { ...modern[0].evidence.trial, id: 'foreign-task-01' },
      },
    };
    const report = renderComparison([...modern, foreign], read);
    expect(report).toContain(
      '| Run | Agent | Model | Status | Agent time | Run time | Checks (exit code) |',
    );
    expect(report).toContain('`codex` | `gpt-6.1-sol`');
    expect(report).toContain('Agent is the variable under test');
    expect(report).not.toContain('foreign-task-01');
  });

  it('opens the verdict with the full pass count and shows the failed run with its checks', () => {
    const report = renderComparison(runs(), read);
    expect(verdict(report).split('\n')[0]).toBe('- Full pass count 2/3');
    expect(report).toContain('`named paths outside the clone: /tmp/verify.log`');
    expect(report).toMatch(/todo-01.*`install`, `verify`, `e2e` and `structure`.*exited `0`/);
    expect(verdict(report)).toContain('Baseline: shared');
  });

  it('renders a split baseline as a row that does not hold, and says so in the verdict', () => {
    const report = renderComparison(
      runs((records) => {
        records[2].agent.resolvedModel = 'claude-other';
      }),
      read,
    );
    expect(report).toMatch(/\| Resolved model \|.*\| no \|/);
    expect(verdict(report)).toContain('Baseline: differs at Resolved model');
  });

  it('re-derives each rendered prompt from the template', () => {
    const report = renderComparison(
      runs((records) => {
        records[1].prompt.sha256 = 'f'.repeat(64);
      }),
      read,
    );
    expect(report).toMatch(/\| Rendered prompt SHA-256 \|.*\| no \|/);
  });

  it('places a flagged re-export dropped and a dashed edge inside freedoms 9 and 8, so the runs are consistent', () => {
    const report = renderComparison(runs(), read);
    expect(verdict(report)).toContain(
      '- Consistency: `consistent`. 0 aspects sit outside the spec',
    );
    expect(report).not.toContain('## Outside the spec');
    const inside = report.split('## Inside a spec freedom')[1]?.split('\n## ')[0] ?? '';
    expect(inside).toMatch(
      /\| `public-api · exports web:web-api-client` \|.*\| 9 \| script rule \|/,
    );
    expect(inside).toMatch(
      /\| `structure · edge api-procedures -\.-> api-domain` \|.*\| 8 \| script rule \|/,
    );
  });

  it('shows an author note as the Why of an outside-spec aspect, with no rulings section', () => {
    const report = renderComparison(runs(undefined, {}), read, {
      notes: [{ key: API_CLIENT_EXPORTS, why: 'the barrel lost a re-export' }],
    });
    expect(report).not.toContain('## Rulings by the author');
    expect(report).toMatch(
      /\| `public-api · exports web:web-api-client` \|.*\| the barrel lost a re-export \| author's note \|/,
    );
  });

  it('quotes the first tool call that names each outside path of a failed run', () => {
    const report = renderComparison(runs(), read);
    expect(report).toContain('`pnpm verify > /tmp/verify.log 2>&1; echo EXIT=$?;');
    expect(report).toContain('existed before the agent ran');
  });

  it('names the /tmp paths every run wrote, and which of them existed before the run', () => {
    const report = renderComparison(runs(), read);
    expect(report).toContain(
      'Every run wrote logs under `/tmp`: `todo-01` to `/tmp/verify.log`; `todo-02` to `/tmp/verify-todo02.log` and `/tmp/e2e-todo02.log`; `todo-03` to `/tmp/verify03.log` and `/tmp/e2e03.log`. The paths of `todo-02` and `todo-03` were new during their runs, so the ADR 0034 allowlist covers them. `/tmp/verify.log` already existed when `todo-01` started, from an unrelated job on the shared box.',
    );
    expect(verdict(report).split('\n')[1]).toBe(
      '- `todo-01` failed only on `/tmp/verify.log`, which existed before its run; every run wrote logs under `/tmp` (see Runs).',
    );
  });

  it('throws on a cause for a path that no run found before its agent ran', () => {
    expect(() =>
      renderComparison(runs(), read, { causes: { '/tmp/e2e03.log': 'from another job' } }),
    ).toThrow('stale');
  });

  it('states the trunk drift since the recorded enforcement rev, and throws when it names another rev', () => {
    const baseline = renderComparison(runs(), read).split('## Baseline')[1]?.split('\n## ')[0];
    expect(baseline).toContain('The runs recorded enforcement rev `3d35bf1`.');
    expect(baseline).toContain('`1321f04`');
    expect(() =>
      renderComparison(runs(), read, { drift: { since: 'f'.repeat(40), text: 'x' } }),
    ).toThrow('enforcement rev');
  });

  it('puts the dimension tables right after the verdict', () => {
    const headings = [...renderComparison(runs(), read).matchAll(/^## (.+)$/gm)].map(
      ([, heading]) => heading,
    );
    expect(headings).toEqual([
      'Verdict',
      'Structure',
      'Public API',
      'Dependencies',
      'Component boundaries',
      'Conventions',
      'Runs',
      'Baseline',
      'Method',
      'Inside a spec freedom',
      'Diagrams',
    ]);
  });

  it('lists only the baseline rows a rendered report can show, with the template caveat', () => {
    const report = renderComparison(runs(), read);
    expect(report).not.toContain('Real agent session');
    expect(report).toContain('`tooling/trial/todo-prompt.md` as committed');
  });

  it('names the two places a name reaches the method', () => {
    expect(renderComparison(runs(), read)).toContain(
      'a router key breaks a tie between two `{ id }` mutations whose outputs match',
    );
  });

  it("shows every run's diagram without its header, the failed run marked", () => {
    const diagrams =
      renderComparison(runs(), read).split('## Diagrams')[1]?.split('\n## ')[0] ?? '';
    expect(diagrams).toContain('### `todo-01` (`failed`, from `docs/trials/todo-01.patch`)');
    expect(diagrams.match(/```mermaid\nflowchart LR\n/g)).toHaveLength(3);
    expect(diagrams).not.toContain('%%');
  });
});

describe('checkRunEvidence', () => {
  const record = evidence('todo-02');
  const files = record.result.changedPaths.filter((path: string) =>
    path.startsWith('showcase/todo-02/'),
  );
  const stream = read(record.stream.path);

  it('accepts a run whose files and stream match its evidence', () => {
    expect(() => checkRunEvidence(record, files, stream)).not.toThrow();
  });

  it('throws on a file set that differs from result.changedPaths', () => {
    expect(() =>
      checkRunEvidence(record, [...files, 'showcase/todo-02/web/extra.ts'], stream),
    ).toThrow('result.changedPaths');
  });

  it('throws on a stream that differs from stream.sha256', () => {
    expect(() => checkRunEvidence(record, files, `${stream}\n`)).toThrow('stream.sha256');
  });
});

describe('checkLandedRuns', () => {
  it('compares the landed and passed ids as sets', () => {
    expect(() => checkLandedRuns(['todo-10', 'todo-9'], ['todo-9', 'todo-10'])).not.toThrow();
    expect(() => checkLandedRuns(['todo-9'], ['todo-9', 'todo-10'])).toThrow('todo-10');
  });
});

describe('hasTrialEvidence', () => {
  const withRoot = (build: (root: string) => void, assert: (root: string) => void) => {
    const root = mkdtempSync(join(tmpdir(), 'compare-'));
    try {
      build(root);
      assert(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('is true when docs/trials holds a record', () => {
    withRoot(
      (root) => {
        mkdirSync(join(root, 'docs/trials'), { recursive: true });
        writeFileSync(join(root, 'docs/trials/todo-01.json'), '{}\n');
      },
      (root) => expect(hasTrialEvidence(root)).toBe(true),
    );
  });

  it('is false for a rerun scaffold or a trial clone: a showcase result, no record', () => {
    withRoot(
      (root) => {
        mkdirSync(join(root, 'docs/trials'), { recursive: true });
        for (const pkg of ['web', 'api']) {
          mkdirSync(join(root, `showcase/todo-01/${pkg}`), { recursive: true });
          writeFileSync(join(root, `showcase/todo-01/${pkg}/package.json`), '{}\n');
        }
      },
      (root) => expect(hasTrialEvidence(root)).toBe(false),
    );
  });

  it('is false when docs/trials is gone', () => {
    withRoot(
      () => undefined,
      (root) => expect(hasTrialEvidence(root)).toBe(false),
    );
  });
});

describe('comparison exit status', () => {
  const runs = ['todo-01', 'todo-02'].map((id) => ({
    evidence: { ...evidence(id), result: { ...evidence(id).result, status: 'passed' } },
    source: `showcase/${id}`,
    facts: facts(id),
  }));

  it('accepts identical passing runs on a shared baseline', () => {
    expect(comparisonFailures(runs, read)).toEqual([]);
  });

  it('names both a failed run and a split baseline even when the builds match', () => {
    const failed = runs.map((run) => ({ ...run, evidence: evidence(run.evidence.trial.id) }));
    failed[1].evidence.agent.resolvedModel = 'another-model';
    expect(comparisonFailures(failed, read)).toEqual([
      'Baseline differs: Resolved model',
      'Failed run: todo-01',
    ]);
  });

  it.each([
    false,
    true,
  ])('writes the report and exits according to mutation output differences: %p', (differs) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'compare-cli-')));
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    try {
      cpSync(join(ROOT, 'tooling'), join(root, 'tooling'), { recursive: true });
      symlinkSync(join(ROOT, 'scripts'), join(root, 'scripts'), 'dir');
      symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
      write('.fallowrc.jsonc', read('.fallowrc.jsonc'));
      write(
        'tooling/trial/todo-prompt.md',
        read('tooling/trial/todo-prompt.md').split('\n## Shared machine\n')[0],
      );
      runs.forEach((run, index) => {
        const id = run.evidence.trial.id;
        const tree = variant(
          id,
          ...(differs && index === 1
            ? [replaceIn(API_REPORT, /output: \{\r?\nid: string;\r?\n\};/, 'output: Todo;')]
            : []),
        );
        tree.forEach((text, path) => {
          write(`showcase/${id}/${path}`, text);
        });
        write(
          `docs/trials/${id}.json`,
          JSON.stringify({
            ...run.evidence,
            schema: 2,
            task: {
              name: 'todo',
              definitionSha256: 'b'.repeat(64),
              target: null,
              checks: ['install', 'verify', 'e2e', 'structure'],
              land: 'showcase',
            },
            agent: {
              ...run.evidence.agent,
              name: 'claude',
              modelSource: 'stream',
              reasoningEffort: null,
            },
            run: { ...run.evidence.run, tokenUsage: null },
            failures: [],
            result: {
              ...run.evidence.result,
              patch: null,
              outsideReads: [],
              changedPaths: [...tree.keys()].map((path) => `showcase/${id}/${path}`),
            },
          }),
        );
        write(run.evidence.stream.path, read(run.evidence.stream.path));
      });
      execFileSync('git', ['init', '--quiet', root]);
      execFileSync('git', ['add', 'showcase'], { cwd: root });
      const result = spawnSync(process.execPath, [join(root, 'tooling/trial/compare.mjs')], {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
      });
      expect(result.stderr).toEqual(
        differs ? expect.stringContaining('public-api · delete output') : '',
      );
      expect(result.status).toBe(differs ? 1 : 0);
      expect(readFileSync(join(root, REPORT_PATH), 'utf8')).toContain(
        `Consistency: \`${differs ? 'inconsistent' : 'consistent'}\``,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the committed comparison', () => {
  it('keeps docs/trials/comparison.md current, or absent before the first trial record', () => {
    // A rerun scaffold removes the old records (ADR 0047), so until the rerun
    // lands its first record there is no report to keep current; a showcase
    // result with no record is a trial clone mid-run.
    if (hasTrialEvidence(ROOT)) {
      expect(read(REPORT_PATH)).toBe(comparisonReport(ROOT));
    } else {
      expect(existsSync(resolve(ROOT, REPORT_PATH))).toBe(false);
    }
  });

  const freedomsOf = (path: string) => {
    const section =
      read(path)
        .split(/^## Spec freedoms\n/m)[1]
        ?.split(/^## /m)[0] ?? '';
    return [...section.matchAll(/^(\d+)\. (.+)$/gm)].map(([, number, text]) => [
      Number(number),
      text,
    ]);
  };
  const numbered = FREEDOMS.map((text, index) => [index + 1, text]);

  it('lists the seven freedoms of ADR 0035 and then the two of ADR 0037', () => {
    expect(freedomsOf('.agents/decisions/0035-trial-comparison.md')).toEqual(numbered.slice(0, 7));
    expect(freedomsOf('.agents/decisions/0037-type-only-edges-and-flagged-re-exports.md')).toEqual(
      numbered.slice(7),
    );
  });

  it('maps every function @repo/ui exports, and only those, as a primitive', () => {
    const exported = [...read('packages/ui/etc/ui.api.md').matchAll(/^export function (\w+)\(/gm)]
      .map(([, name]) => name)
      .sort();
    expect([...new Set(Object.values(UI_PRIMITIVE_FOR))].sort()).toEqual(exported);
  });
});
