/**
 * The comparison method of ADR 0035 as data. Each dimension turns one result's
 * facts into aspects: one comparable key with one normalized value per run.
 * One engine aligns the aspects across runs and classifies each as identical,
 * inside a named spec freedom, or outside the spec. Names reach only the
 * `written` side of an aspect, which the report shows and the method skips,
 * so freedom 1 holds by construction.
 *
 * @typedef {import('./result-facts.mjs').ResultFacts} ResultFacts
 * @typedef {1 | 2 | 3 | 4 | 5 | 6 | 7} Freedom
 * @typedef {'structure' | 'public-api' | 'dependencies' | 'component-boundaries' | 'conventions'} DimensionId
 * @typedef {(
 *   | { readonly kind: 'form', readonly key: string, readonly value: string, readonly written: string }
 *   | { readonly kind: 'invariant', readonly key: string, readonly holds: boolean, readonly written: string }
 * )} Aspect
 * @typedef {{
 *   readonly id: DimensionId,
 *   readonly title: string,
 *   readonly normalizedForm: string,
 *   readonly mustBeIdentical: string,
 *   readonly aspects: (facts: ResultFacts) => readonly Aspect[],
 *   readonly freedoms: readonly { readonly key: RegExp, readonly freedom: Freedom, readonly why: string }[],
 *   readonly fixed?: readonly { readonly key: RegExp, readonly why: string }[],
 * }} Dimension
 * @typedef {(
 *   | { readonly classification: 'identical' }
 *   | { readonly classification: 'spec-freedom', readonly freedom: Freedom, readonly why: string, readonly by: 'rule' | 'ruling' }
 *   | { readonly classification: 'outside-spec', readonly why: string }
 * )} Verdict
 * @typedef {Verdict & {
 *   readonly dimension: DimensionId,
 *   readonly aspect: string,
 *   readonly key: string,
 *   readonly kind: 'form' | 'invariant',
 *   readonly values: ReadonlyMap<string, { readonly value: string, readonly written: string }>,
 * }} Difference  `key` is `<dimension> · <aspect>`; a run without the aspect reads `(absent)`
 * @typedef {{ readonly key: string, readonly freedom: Freedom, readonly why: string }} Ruling
 * @typedef {{
 *   readonly method: readonly { id: DimensionId, title: string, normalizedForm: string, mustBeIdentical: string }[],
 *   readonly freedoms: readonly { number: Freedom, text: string, cited: readonly string[] }[],
 *   readonly differences: readonly Difference[],
 *   readonly consistent: boolean,
 * }} Comparison
 */

/** PLAN "Spec freedoms", word for word; ADR 0035 lists the same seven. */
export const FREEDOMS = [
  'Identifier and file names inside a role, including component, hook, procedure and router key names.',
  'How a role splits into files, components, hooks and functions.',
  'The type and generation of `id`.',
  'What a mutation returns.',
  'Copy text and styling outside the UI contract names.',
  'Test names and the number of tests beyond what the gates require.',
  'Optional roles left empty, when all three agree.',
];

/** Intrinsic control to the `@repo/ui` primitive that replaces it. */
export const UI_PRIMITIVE_FOR = {
  button: 'Button',
  'input:text': 'TextField',
  'input:email': 'TextField',
  'input:search': 'TextField',
};

/** Roles whose components come with the reference scaffold, compared by signature only. */
const SCAFFOLD_COMPONENT_ROLES = ['web-app', 'web-api-client'];
const FEATURE_COMPONENT_ROLES = ['web-routes', 'ui'];
const OPERATIONS = ['list', 'create', 'toggle', 'delete'];
const SERVER_STATE = new Set([
  'useQuery',
  'useMutation',
  'useQueryClient',
  'useSuspenseQuery',
  'useInfiniteQuery',
]);
const LOCAL_STATE = new Set(['useState', 'useReducer']);
const ABSENT = '(absent)';

/** @returns {Aspect} */
const form = (key, value, written = value) => ({ kind: 'form', key, value, written });
/** @returns {Aspect} */
const invariant = (key, holds, written) => ({ kind: 'invariant', key, holds, written });
const listed = (values) => (values.length === 0 ? '(none)' : values.join(', '));

/** @param {ResultFacts} facts */
function structureAspects(facts) {
  const roles = [...facts.sourceFiles.keys()].filter((role) => role !== 'outside-roles');
  return [
    ...roles.map((role) =>
      form(`role ${role}`, facts.diagram.roles.includes(role) ? 'present' : 'absent'),
    ),
    ...facts.diagram.edges.map((edge) =>
      form(`edge ${edge.from} ${edge.typeOnly ? '-.->' : '-->'} ${edge.to}`, 'present'),
    ),
    ...[...facts.sourceFiles].map(([role, files]) =>
      form(`files ${role}`, String(files.length), listed(files)),
    ),
    ...[...facts.sourceFiles.keys(), 'e2e']
      .filter((role) => role === 'e2e' || facts.sourceFiles.get(role)?.length)
      .map((role) => {
        const tests = facts.testFiles.get(role) ?? [];
        return form(`tests ${role}`, String(tests.length), listed(tests));
      }),
  ];
}

const ITEM_FIELDS = 'completed,id,title';

/** @param {ResultFacts} facts */
function publicApiAspects(facts) {
  const operations = facts.procedures.map((procedure) => procedure.operation);
  const kindsHold = facts.procedures.every(
    (procedure) =>
      procedure.operation === null ||
      (procedure.operation === 'list') === (procedure.kind === 'query'),
  );
  const shape = new Map(facts.item?.shape ?? []);
  const recognized = OPERATIONS.flatMap((operation) =>
    facts.procedures.filter((procedure) => procedure.operation === operation),
  );
  const unrecognized = facts.procedures.filter((procedure) => procedure.operation === null);
  return [
    invariant(
      'operations',
      kindsHold && [...operations].sort().join() === [...OPERATIONS].sort().join(),
      listed(facts.procedures.map((p) => `${p.path} ${p.kind} ${p.operation ?? '(unrecognized)'}`)),
    ),
    invariant(
      'item shape',
      [...shape.keys()].join() === ITEM_FIELDS &&
        shape.get('title') === 'string' &&
        shape.get('completed') === 'boolean',
      facts.item
        ? `{ ${facts.item.shape.map(([name, type]) => `${name}: ${type}`).join('; ')} }`
        : '(none)',
    ),
    form('item id type', shape.get('id') ?? '(none)'),
    ...recognized.flatMap((procedure) => [
      form(`${procedure.operation} input`, procedure.input.normalized, procedure.input.written),
      form(`${procedure.operation} output`, procedure.output.normalized, procedure.output.written),
    ]),
    ...unrecognized.map((procedure, index) =>
      form(
        `unrecognized procedure ${index + 1}`,
        `${procedure.kind} ${procedure.input.normalized} -> ${procedure.output.normalized}`,
        procedure.path,
      ),
    ),
    ...facts.apiReports.map((report) => {
      const count = (kind) => report.exports.filter((entry) => entry.kind === kind).length;
      return form(
        `exports ${report.key}`,
        `value ${count('value')} · type ${count('type')}`,
        listed(report.exports.map((entry) => entry.name)),
      );
    }),
  ];
}

/** @param {ResultFacts} facts */
function dependencyAspects(facts) {
  return Object.entries(facts.manifests).flatMap(([pack, manifest]) => [
    ...Object.entries(manifest.dependencies).map(([name, range]) => form(`${pack} ${name}`, range)),
    form(`${pack} manifest`, manifest.rest),
  ]);
}

/** Calls with the result's own hooks erased to `use*`, since their names are free. */
const callsOf = (facts, calls) => {
  const own = new Set(facts.hooks.map((hook) => hook.name));
  return calls.map((call) => (own.has(call) ? 'use*' : call)).join(',');
};

const byRole = (entries) =>
  [...Map.groupBy(entries, (entry) => entry.role)].sort(([a], [b]) => (a < b ? -1 : 1));

/** @param {ResultFacts} facts */
function componentAspects(facts) {
  const features = facts.components.filter((c) => !SCAFFOLD_COMPONENT_ROLES.includes(c.role));
  const routeExports = new Set(
    facts.apiReports
      .filter((report) => report.key === 'web:web-routes')
      .flatMap((report) => report.exports.map((entry) => entry.name)),
  );
  const pages = features.filter((c) => c.role === 'web-routes' && routeExports.has(c.name));
  const raw = [...new Set(features.flatMap((c) => c.rawControls))].sort();
  return [
    invariant('page', pages.length > 0, listed(pages.map((c) => c.name))),
    invariant(
      'ui controls',
      raw.every((control) => !(control in UI_PRIMITIVE_FOR)),
      listed(raw),
    ),
    invariant(
      'feature component roles',
      features.every((c) => FEATURE_COMPONENT_ROLES.includes(c.role)),
      listed([...new Set(features.map((c) => c.role))].sort()),
    ),
    ...byRole(facts.components).map(([role, components]) =>
      form(
        `components ${role}`,
        components
          .map(
            (c) =>
              `props(${c.props.join(',')}) ui(${c.uiPrimitives.join(',')}) raw(${c.rawControls.join(',')}) calls(${callsOf(facts, c.calls)})`,
          )
          .sort()
          .join(' ; '),
        listed(components.map((c) => c.name)),
      ),
    ),
  ];
}

/** @param {ResultFacts} facts */
function conventionAspects(facts) {
  const calling = (entries, names) =>
    entries.filter((entry) => entry.calls.some((call) => names.has(call)));
  const serverHooks = calling(facts.hooks, SERVER_STATE);
  const forms = calling([...facts.hooks, ...facts.components], new Set(['useForm']));
  const localInComponents = calling(facts.components, LOCAL_STATE);
  return [
    invariant(
      'server state',
      serverHooks.length > 0 &&
        calling(facts.components, SERVER_STATE).length === 0 &&
        serverHooks.every((hook) => hook.calls.includes('useTrpc')),
      listed(serverHooks.map((hook) => hook.name)),
    ),
    invariant(
      'one form',
      forms.length === 1 && forms[0].calls.includes('effectTsResolver'),
      listed(forms.map((entry) => entry.name)),
    ),
    invariant(
      'local state',
      localInComponents.length === 0,
      listed(localInComponents.map((component) => component.name)),
    ),
    invariant(
      'storage role',
      facts.storage.roles.join() === 'api-integrations',
      listed(facts.storage.roles),
    ),
    ...byRole(facts.hooks).map(([role, hooks]) =>
      form(
        `hooks ${role}`,
        hooks
          .map((hook) => `calls(${callsOf(facts, hook.calls)})`)
          .sort()
          .join(' ; '),
        listed(hooks.map((hook) => hook.name)),
      ),
    ),
    form('id generation', facts.storage.idSource),
  ];
}

/** @type {readonly Dimension[]} */
const DIMENSIONS = [
  {
    id: 'structure',
    title: 'Structure',
    normalizedForm:
      'Roles and role edges from `architecture.mmd` without its header, source files per role, test files per role of the file they test',
    mustBeIdentical: 'Role set and role edges',
    aspects: structureAspects,
    freedoms: [
      { key: /^files (?!outside-roles)/, freedom: 2, why: 'how a role splits into files' },
      {
        key: /^tests /,
        freedom: 6,
        why: 'each run held the gates its checks ran, so the count beyond them is free',
      },
    ],
    fixed: [
      { key: /^edge /, why: 'the spec freedoms leave role edges fixed' },
      { key: /^role /, why: 'the spec freedoms leave the role set fixed' },
    ],
  },
  {
    id: 'public-api',
    title: 'Public API',
    normalizedForm:
      'Procedures by kind and operation, inferred from their shapes, with normalized input and output; the item shape; export kinds per API report, keyed by package and role',
    mustBeIdentical:
      'One list query and three mutations for create, toggle and delete; create takes `title: string`; toggle and delete take `id`; the item has exactly `id`, `title: string` and `completed: boolean`',
    aspects: publicApiAspects,
    freedoms: [
      { key: /^(create|toggle|delete) output$/, freedom: 4, why: 'what a mutation returns' },
      { key: /^item id type$/, freedom: 3, why: 'the type of `id`' },
    ],
  },
  {
    id: 'dependencies',
    title: 'Dependencies',
    normalizedForm:
      'Dependency names and ranges per package and section, the own workspace package as `@{id}`; the rest of each manifest',
    mustBeIdentical: 'Equal sets',
    aspects: dependencyAspects,
    freedoms: [],
  },
  {
    id: 'component-boundaries',
    title: 'Component boundaries',
    normalizedForm:
      'Components per role as prop kinds, `@repo/ui` primitives, raw controls and hook calls, names erased',
    mustBeIdentical:
      'Page in `web-routes`; form controls from `@repo/ui` where a primitive exists; feature components only in `web-routes` and `ui`',
    aspects: componentAspects,
    freedoms: [{ key: /^components /, freedom: 2, why: 'how a role splits into components' }],
  },
  {
    id: 'conventions',
    title: 'Conventions',
    normalizedForm:
      'Hook calls per hook, names erased; `effectTsResolver` use; local state; storage role; id generation',
    mustBeIdentical:
      'Server state in `use*` hooks through `useTrpc`; one form through React Hook Form and Effect Schema; local state in `use*` hooks; storage in `api-integrations`',
    aspects: conventionAspects,
    freedoms: [
      { key: /^hooks /, freedom: 2, why: 'how a role splits into hooks' },
      { key: /^id generation$/, freedom: 3, why: 'the generation of `id`' },
    ],
  },
];

/**
 * Each aspect key of one dimension with every run's aspect or undefined. A key
 * only a later run has goes right after the key it follows in that run.
 */
function alignAspects(dimension, results) {
  const perRun = results.map((facts) => new Map(dimension.aspects(facts).map((a) => [a.key, a])));
  const keys = [];
  for (const aspects of perRun) {
    let at = 0;
    for (const key of aspects.keys()) {
      const found = keys.indexOf(key);
      if (found === -1) {
        keys.splice(at, 0, key);
      }
      at = (found === -1 ? at : found) + 1;
    }
  }
  return keys.map((key) => ({ key, aspects: perRun.map((aspects) => aspects.get(key)) }));
}

const cellOf = (aspect) => {
  if (!aspect) {
    return { value: ABSENT, written: ABSENT };
  }
  const value = aspect.kind === 'invariant' ? (aspect.holds ? 'holds' : 'breaks') : aspect.value;
  return { value, written: aspect.written };
};

/** @returns {Verdict} */
function classify(dimension, key, aspects) {
  if (aspects.some((aspect) => aspect?.kind === 'invariant')) {
    return aspects.every((aspect) => aspect?.kind === 'invariant' && aspect.holds)
      ? { classification: 'identical' }
      : { classification: 'outside-spec', why: 'the method holds every run to this rule' };
  }
  const values = new Set(aspects.map((aspect) => cellOf(aspect).value));
  if (values.size === 1) {
    return { classification: 'identical' };
  }
  const rule = dimension.freedoms.find((freedom) => freedom.key.test(key));
  if (rule) {
    return { classification: 'spec-freedom', freedom: rule.freedom, why: rule.why, by: 'rule' };
  }
  return {
    classification: 'outside-spec',
    why:
      dimension.fixed?.find((fixed) => fixed.key.test(key))?.why ??
      'the spec freedoms leave this aspect fixed',
  };
}

/** @returns {readonly Difference[]} */
function applyRulings(differences, rulings) {
  const ruled = new Map(differences.map((difference) => [difference.key, difference]));
  for (const ruling of rulings) {
    const difference = ruled.get(ruling.key);
    if (difference?.classification !== 'outside-spec') {
      throw new Error(
        `compare: the ruling on "${ruling.key}" is stale; the comparison has ${difference ? `it as ${difference.classification}` : 'no such aspect'}.`,
      );
    }
    const { dimension, aspect, key, kind, values } = difference;
    ruled.set(key, {
      dimension,
      aspect,
      key,
      kind,
      values,
      classification: 'spec-freedom',
      freedom: ruling.freedom,
      why: ruling.why,
      by: 'ruling',
    });
  }
  return [...ruled.values()];
}

/**
 * Compares the runs dimension by dimension. Every aspect any run has becomes one
 * Difference, identical ones included, in registry order. Classification: an
 * invariant is identical when it holds in every run, else outside the spec; a
 * form is identical when every run has the same value, else inside the first
 * freedom rule that names it, else outside the spec. Each ruling then turns
 * one outside-spec difference into the freedom it names.
 *
 * @param {readonly ResultFacts[]} results
 * @param {readonly Ruling[]} [rulings]
 * @returns {Comparison}
 * @throws when a ruling names a missing aspect or one that is not outside the spec
 */
export function compareResults(results, rulings = []) {
  const ids = results.map((facts) => facts.id);
  const differences = applyRulings(
    DIMENSIONS.flatMap((dimension) =>
      alignAspects(dimension, results).map(({ key, aspects }) => ({
        dimension: dimension.id,
        aspect: key,
        key: `${dimension.id} · ${key}`,
        kind: aspects.find(Boolean)?.kind ?? 'form',
        values: new Map(ids.map((id, index) => [id, cellOf(aspects[index])])),
        ...classify(dimension, key, aspects),
      })),
    ),
    rulings,
  );
  return {
    method: DIMENSIONS.map(({ id, title, normalizedForm, mustBeIdentical }) => ({
      id,
      title,
      normalizedForm,
      mustBeIdentical,
    })),
    freedoms: FREEDOMS.map((text, index) => ({
      number: /** @type {Freedom} */ (index + 1),
      text,
      cited: differences
        .filter((difference) => 'freedom' in difference && difference.freedom === index + 1)
        .map((difference) => difference.key),
    })),
    differences,
    consistent: differences.every((difference) => difference.classification !== 'outside-spec'),
  };
}
