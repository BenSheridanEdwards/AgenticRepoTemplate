/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  checkLandedRuns,
  checkRunEvidence,
  comparisonReport,
  REPORT_PATH,
  renderComparison,
} from './compare.mjs';
import { compareResults, FREEDOMS, UI_PRIMITIVE_FOR } from './dimensions.mjs';
import {
  readContract,
  readFlaggedReExports,
  readResultFacts,
  treeFromPatch,
} from './result-facts.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
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

/** A stream with one user event per tool result. */
const streamOf = (...contents: ToolContent[]) =>
  contents
    .map((content) =>
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content }] },
      }),
    )
    .join('\n');

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

  it('places a mutation output under freedom 4 and tells toggle from delete by name on a tie', () => {
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
      ['public-api · delete output', 'spec-freedom', 4],
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

  it('places another split of a role into files and components under freedom 2', () => {
    const split = facts('todo-02', (tree) => {
      tree.set(
        `${ROUTES}/TodoEmpty.tsx`,
        'export function TodoEmpty() {\n  return <p className="todo-note">Empty</p>;\n}\n',
      );
    });
    expect(departures(compareResults([facts('todo-01'), split]))).toEqual([
      ['structure · files web-routes', 'spec-freedom', 2],
      ['component-boundaries · components web-routes', 'spec-freedom', 2],
    ]);
  });

  it('keeps a split that moves a call into a new component of the role under freedom 2', () => {
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
      ['structure · files web-routes', 'spec-freedom', 2],
      ['component-boundaries · components web-routes', 'spec-freedom', 2],
    ]);
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
  ])('keeps a dropped re-export outside the spec with %s', (_, streamText) => {
    const dropped = factsWith('todo-02', streamText, withoutRouterInputs);
    expect(departures(compareResults([facts('todo-01'), dropped]))).toEqual([
      [API_CLIENT_EXPORTS, 'outside-spec', null],
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

describe('readFlaggedReExports', () => {
  const roleOf = (path: string) => contract.roleOf(`showcase/todo-02/${path}`);
  const ESC = '\u001b';

  it('reads the unused re-exports of both content shapes, with the kind of their section', () => {
    const ansi = `${ESC}[1m● Unused exports (2)${ESC}[0m\n  ${ESC}[36mshowcase/todo-02/web/src/api-client/index.ts${ESC}[0m\n    :2 TestApiProvider (re-export)\n    :3 helper\n`;
    const stream = streamOf(
      [{ type: 'text', text: auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs') }],
      ansi,
      auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs'),
    );
    expect(readFlaggedReExports(stream, 'showcase/todo-02', roleOf)).toEqual([
      { key: 'web:web-api-client', name: 'RouterInputs', kind: 'type' },
      { key: 'web:web-api-client', name: 'TestApiProvider', kind: 'value' },
    ]);
  });

  it("skips the files of another result's root and the findings of other sections", () => {
    const stream = streamOf(
      auditOutput(API_CLIENT_INDEX('todo-01'), 'RouterInputs'),
      auditOutput(API_CLIENT_INDEX('todo-02'), 'RouterInputs', '● Unused files (1)'),
    );
    expect(readFlaggedReExports(stream, 'showcase/todo-02', roleOf)).toEqual([]);
    expect(readFlaggedReExports(null, 'showcase/todo-02', roleOf)).toEqual([]);
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

describe('the committed comparison', () => {
  it('keeps docs/trials/comparison.md equal to what the committed results give', () => {
    expect(read(REPORT_PATH)).toBe(comparisonReport(ROOT));
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
