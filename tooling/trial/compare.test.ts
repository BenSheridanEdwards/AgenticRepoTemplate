/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { comparisonReport, REPORT_PATH, renderComparison } from './compare.mjs';
import { compareResults, FREEDOMS, UI_PRIMITIVE_FOR } from './dimensions.mjs';
import { readContract, readResultFacts, treeFromPatch } from './result-facts.mjs';

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

const facts = (id: string, ...edits: Edit[]) =>
  readResultFacts({
    id,
    root: `showcase/${id}`,
    passed: true,
    tree: variant(id, ...edits),
    contract,
  });

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

const API_REPORT = 'api/etc/api.api.md';
const ROUTES = 'web/src/routes/todos';

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

  it('marks an extra role edge outside the spec', () => {
    const edged = facts(
      'todo-03',
      replaceIn(
        'architecture.mmd',
        '  api_procedures --> api_trpc\n',
        '  api_procedures --> api_trpc\n  api_procedures -.-> api_domain\n',
      ),
    );
    const comparison = compareResults([facts('todo-01'), edged]);
    expect(departures(comparison)).toEqual([
      ['structure · edge api-procedures -.-> api-domain', 'outside-spec', null],
    ]);
    expect(find(comparison, 'structure · edge api-procedures -.-> api-domain').why).toMatch(
      /role edges/,
    );
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
      ['component-boundaries · components web-routes', 'spec-freedom', 2],
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

  it('throws on a stale ruling', () => {
    const pair = [facts('todo-01'), facts('todo-02')];
    expect(() =>
      compareResults(pair, [{ key: 'public-api · missing', freedom: 2, why: 'x' }]),
    ).toThrow('public-api · missing');
    expect(() =>
      compareResults(pair, [{ key: 'public-api · operations', freedom: 2, why: 'x' }]),
    ).toThrow('public-api · operations');
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

describe('renderComparison', () => {
  const withoutRouterInputs = replaceIn(
    'web/etc/api-client.api.md',
    /\/\/ @public \(undocumented\)\r?\nexport type RouterInputs [^\n]*\n/,
    '',
  );
  const evidence = (id: string) => JSON.parse(read(`docs/trials/${id}.json`));
  const runs = (change: (records: ReturnType<typeof evidence>[]) => void = () => undefined) => {
    const records = ['todo-01', 'todo-02', 'todo-03'].map(evidence);
    change(records);
    return records.map((record) => ({
      evidence: record,
      source: record.result.patch ?? `showcase/${record.trial.id}`,
      facts: {
        ...facts(record.trial.id, ...(record.trial.id === 'todo-02' ? [withoutRouterInputs] : [])),
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

  it('shows the author ruling apart from the script classifications', () => {
    const report = renderComparison(runs(), read);
    expect(report).toContain('## Rulings by the author');
  });

  it("shows every run's diagram without its header, the failed run marked", () => {
    const diagrams =
      renderComparison(runs(), read).split('## Diagrams')[1]?.split('\n## ')[0] ?? '';
    expect(diagrams).toContain('### `todo-01` (`failed`, from `docs/trials/todo-01.patch`)');
    expect(diagrams.match(/```mermaid\nflowchart LR\n/g)).toHaveLength(3);
    expect(diagrams).not.toContain('%%');
  });
});

describe('the committed comparison', () => {
  it('keeps docs/trials/COMPARISON.md equal to what the committed results give', () => {
    expect(read(REPORT_PATH)).toBe(comparisonReport(ROOT));
  });

  it('lists the same seven freedoms as ADR 0035', () => {
    const adr = read('.agents/decisions/0035-trial-comparison.md');
    const section = adr.split(/^## Spec freedoms\n/m)[1]?.split(/^## /m)[0] ?? '';
    const items = [...section.matchAll(/^(\d+)\. (.+)$/gm)].map(([, number, text]) => [
      Number(number),
      text,
    ]);
    expect(items).toEqual(FREEDOMS.map((text, index) => [index + 1, text]));
  });

  it('names only primitives that @repo/ui exports', () => {
    const report = read('packages/ui/etc/ui.api.md');
    for (const primitive of new Set(Object.values(UI_PRIMITIVE_FOR))) {
      expect(report).toMatch(new RegExp(`^export function ${primitive}\\(`, 'm'));
    }
  });
});
