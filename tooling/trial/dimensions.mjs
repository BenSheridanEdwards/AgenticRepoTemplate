/**
 * The comparison method of ADR 0035 as data. Each dimension turns one result's
 * facts into aspects: one comparable key with one normalized value per run.
 * One engine aligns the aspects across runs and classifies each as identical,
 * inside a named spec freedom, or outside the spec. A name in a feature role
 * reaches only the `written` side of an aspect, which the report shows and the
 * method skips; the exceptions are listed in the report's Method section.
 *
 * @typedef {import('./result-facts.mjs').ResultFacts} ResultFacts
 * @typedef {1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9} Freedom
 * @typedef {'structure' | 'public-api' | 'dependencies' | 'component-boundaries' | 'conventions'} DimensionId
 * @typedef {{ readonly value: string, readonly freedom: Freedom, readonly why: string }} Within
 * @typedef {(
 *   | { readonly kind: 'form', readonly key: string, readonly value: string, readonly written: string, readonly within?: Within }
 *   | { readonly kind: 'invariant', readonly key: string, readonly holds: boolean, readonly written: string }
 * )} Aspect  `within`: the value with only a freedom's part erased; equal in every run, the difference sits in that freedom
 * @typedef {{
 *   readonly id: DimensionId,
 *   readonly title: string,
 *   readonly normalizedForm: string,
 *   readonly mustBeIdentical: string,
 *   readonly aspects: (facts: ResultFacts) => readonly Aspect[],
 *   readonly freedoms: readonly { readonly key: RegExp, readonly freedom: Freedom, readonly why: string, readonly when?: (results: readonly ResultFacts[]) => boolean }[],
 *   readonly fixed?: readonly { readonly key: RegExp, readonly why: string }[],
 * }} Dimension
 * @typedef {(
 *   | { readonly classification: 'identical' }
 *   | { readonly classification: 'spec-freedom', readonly freedom: Freedom, readonly why: string, readonly by: 'rule' | 'ruling' }
 *   | { readonly classification: 'outside-spec', readonly why: string, readonly by: 'rule' | 'note' }
 * )} Verdict
 * @typedef {Verdict & {
 *   readonly dimension: DimensionId,
 *   readonly aspect: string,
 *   readonly key: string,
 *   readonly kind: 'form' | 'invariant',
 *   readonly values: ReadonlyMap<string, { readonly value: string, readonly written: string }>,
 * }} Difference  `key` is `<dimension> · <aspect>`; a run without the aspect reads `(absent)`
 * @typedef {{ readonly key: string, readonly why: string, readonly freedom?: Freedom }} AuthorNote
 *   With `freedom`, a ruling: it moves an outside-spec aspect into that freedom.
 *   Without, it only explains: the aspect stays outside the spec, `why` its reason.
 * @typedef {{
 *   readonly method: readonly { id: DimensionId, title: string, normalizedForm: string, mustBeIdentical: string }[],
 *   readonly freedoms: readonly { number: Freedom, text: string, cited: readonly string[] }[],
 *   readonly differences: readonly Difference[],
 *   readonly consistent: boolean,
 * }} Comparison
 */

import { createHash } from 'node:crypto';
import { BRIEFS } from './briefs.mjs';
import { sortText } from './result-facts.mjs';

/**
 * PLAN "Spec freedoms", word for word, which ADR 0035 lists too, then the two
 * ADR 0037 adds.
 */
export const FREEDOMS = [
  'Identifier and file names inside a role, including component, hook, procedure and router key names.',
  'How a role splits into files, components, hooks and functions.',
  'The type and generation of `id`.',
  'What a mutation returns.',
  'Copy text and styling outside the UI contract names.',
  'Test names and the number of tests beyond what the gates require.',
  'Optional roles left empty, when all three agree.',
  'A type-only import between roles, along any direction, which the comparison reads as a dashed edge.',
  'Dropping a re-export that a gate flagged, such as an unused export Fallow reports.',
];

export const REVOKED_FREEDOMS = [2, 4];

/** Intrinsic control to the `@repo/ui` primitive that replaces it. */
export const UI_PRIMITIVE_FOR = {
  button: 'Button',
  'input:text': 'TextField',
  'input:email': 'TextField',
  'input:search': 'TextField',
};

/** The roles the reference fills with scaffold code. A result keeps them as the reference has them. */
export const SCAFFOLD_ROLES = ['web-app', 'web-api-client', 'api-app', 'api-trpc'];
const FEATURE_COMPONENT_ROLES = ['web-routes', 'ui'];
const SERVER_STATE = new Set([
  'useQuery',
  'useMutation',
  'useQueryClient',
  'useSuspenseQuery',
  'useInfiniteQuery',
]);
const LOCAL_STATE = new Set(['useState', 'useReducer']);
/**
 * Whether a form's calls validate it with Effect Schema: `standardSchemaResolver`
 * over `toStandardSchemaV1` on Effect 4, or `effectTsResolver` in a result from
 * before Effect 4 (ADR 0036).
 */
const usesEffectSchema = (calls) =>
  calls.includes('effectTsResolver') ||
  (calls.includes('standardSchemaResolver') && calls.includes('toStandardSchemaV1'));
const ABSENT = '(absent)';
const SCAFFOLD = SCAFFOLD_ROLES.join('|');
/** `<prefix> <role>` for every role but the scaffold roles and `outside-roles`. */
const featureRole = (prefix) => new RegExp(`^${prefix} (?!(?:${SCAFFOLD}|outside-roles)$)`);
const scaffoldRole = (prefix) => new RegExp(`^${prefix} (?:\\w+:)?(?:${SCAFFOLD})$`);
const SCAFFOLD_FIXED = 'the reference fixes the scaffold roles';
const LAYOUT_FIXED =
  'ADR 0069 fixes file layout and component and hook boundaries within each role';
const shortHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

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
    ...facts.outsideFiles.map(({ path, text }) => ({
      ...form(`file ${path}`, shortHash(text)),
      ...(path === 'web/index.html'
        ? {
            within: {
              value: shortHash(text.replace(/<title>[\s\S]*?<\/title>/, '<title></title>')),
              freedom: /** @type {Freedom} */ (5),
              why: 'copy text: only the `<title>` differs',
            },
          }
        : {}),
    })),
  ];
}

/** @param {ResultFacts} facts */
function publicApiAspects(facts) {
  const brief = BRIEFS[facts.brief];
  const operations = facts.procedures.map((procedure) => procedure.operation);
  const kindsHold = facts.procedures.every(
    (procedure) =>
      procedure.operation === null ||
      (procedure.operation === 'list') === (procedure.kind === 'query'),
  );
  const shape = new Map(facts.item?.shape ?? []);
  const recognized = brief.operations.flatMap((operation) =>
    facts.procedures.filter((procedure) => procedure.operation === operation),
  );
  const unrecognized = facts.procedures.filter((procedure) => procedure.operation === null);
  return [
    invariant(
      'operations',
      kindsHold && [...operations].sort().join() === [...brief.operations].sort().join(),
      listed(facts.procedures.map((p) => `${p.path} ${p.kind} ${p.operation ?? '(unrecognized)'}`)),
    ),
    invariant(
      'item shape',
      [...shape.keys()].join() === Object.keys(brief.item).sort().join() &&
        Object.entries(brief.item).every(
          ([name, type]) => type === null || shape.get(name) === type,
        ),
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
      const flagged = facts.flaggedReExports.filter((entry) => entry.key === report.key);
      const scaffold = SCAFFOLD_ROLES.includes(report.key.split(':')[1]);
      const render = scaffold
        ? (exports) => listed(exports.map((entry) => `${entry.name} ${entry.kind}`))
        : (exports) => {
            const count = (kind) => exports.filter((entry) => entry.kind === kind).length;
            return `value ${count('value')} · type ${count('type')}`;
          };
      const withFlagged = [...report.exports, ...flagged].sort((a, b) => sortText(a.name, b.name));
      const value = render(report.exports);
      return {
        ...form(
          `exports ${report.key}`,
          value,
          scaffold ? value : listed(report.exports.map((entry) => entry.name)),
        ),
        within: {
          value: render(withFlagged),
          freedom: /** @type {Freedom} */ (9),
          why: "a re-export the run's own gate flagged and the run dropped",
        },
      };
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

/** Calls with the result's own hooks erased to `use*`, since their names are free, then sorted. */
const callsOf = (facts, calls) => {
  const own = new Set(facts.hooks.map((hook) => hook.name));
  return calls
    .map((call) => (own.has(call) ? 'use*' : call))
    .sort()
    .join(',');
};

const byRole = (entries) =>
  [...Map.groupBy(entries, (entry) => entry.role)].sort(([a], [b]) => (a < b ? -1 : 1));

/** @param {ResultFacts} facts */
function componentAspects(facts) {
  const features = facts.components.filter((c) => !SCAFFOLD_ROLES.includes(c.role));
  const routeExports = new Set(
    facts.apiReports
      .filter((report) => report.key === 'web:web-routes')
      .flatMap((report) => report.exports.map((entry) => entry.name)),
  );
  const pages = features.filter((c) => c.role === 'web-routes' && routeExports.has(c.name));
  const raw = [...new Set(facts.components.flatMap((c) => c.rawControls))].sort();
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
    ...byRole(facts.components).map(([role, components]) => ({
      ...form(
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
    })),
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
      forms.length === 1 && usesEffectSchema(forms[0].calls),
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
    ...byRole(facts.hooks).map(([role, hooks]) => ({
      ...form(
        `hooks ${role}`,
        hooks
          .map((hook) => `calls(${callsOf(facts, hook.calls)})`)
          .sort()
          .join(' ; '),
        listed(hooks.map((hook) => hook.name)),
      ),
    })),
    form('id generation', facts.storage.idSource),
  ];
}

/**
 * An edge reads dashed when the result diagram dashes it, a pair outside
 * `allow` and so type-only only where Fallow passed the tree, or when every
 * import and re-export along it brings in types only (`readTypeOnlyPairs`).
 */
const DASHED_EDGE = /^edge \S+ -\.-> \S+$/;

/** @type {readonly Dimension[]} */
const DIMENSIONS = [
  {
    id: 'structure',
    title: 'Structure',
    normalizedForm:
      'Roles and role edges from `architecture.mmd` without its header, an edge dashed where its pair is allowed for types only or every import along it brings in types only, source files per role, test files per role of the file they test, and the text of each other file outside every role with the own id as `{id}`',
    mustBeIdentical: 'Role set and role edges',
    aspects: structureAspects,
    freedoms: [
      {
        key: DASHED_EDGE,
        freedom: 8,
        why: "a type-only import between roles; every run's `verify` check exited `0`",
        when: (results) => results.every((facts) => facts.verified),
      },
      {
        key: /^tests /,
        freedom: 6,
        why: "the test count beyond the gates; every run's `verify` check exited `0`",
        when: (results) => results.every((facts) => facts.verified),
      },
    ],
    fixed: [
      {
        key: DASHED_EDGE,
        why: "freedom 8 reads a dashed edge as a type-only import only on trees that passed Fallow, which holds when every run's `verify` check exited `0`",
      },
      { key: /^edge /, why: 'the spec freedoms leave role edges fixed' },
      { key: /^role /, why: 'the spec freedoms leave the role set fixed' },
      { key: scaffoldRole('files'), why: SCAFFOLD_FIXED },
      { key: featureRole('files'), why: LAYOUT_FIXED },
      {
        key: /^tests /,
        why: "freedom 6 counts tests beyond the gates, which holds when every run's `verify` check exited `0`",
      },
      { key: /^file /, why: 'the spec freedoms leave the files outside every role fixed' },
    ],
  },
  {
    id: 'public-api',
    title: 'Public API',
    normalizedForm:
      'Procedures by kind and operation, inferred from their shapes, with normalized input and output; the item shape; export names and kinds per API report of a scaffold role, export kind counts per other API report, keyed by package and role',
    mustBeIdentical: '',
    aspects: publicApiAspects,
    freedoms: [{ key: /^item id type$/, freedom: 3, why: 'the type of `id`' }],
    fixed: [
      { key: scaffoldRole('exports'), why: SCAFFOLD_FIXED },
      { key: /^(create|toggle|delete) output$/, why: 'ADR 0069 fixes mutation output shapes' },
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
    freedoms: [],
    fixed: [
      { key: scaffoldRole('components'), why: SCAFFOLD_FIXED },
      { key: featureRole('components'), why: LAYOUT_FIXED },
    ],
  },
  {
    id: 'conventions',
    title: 'Conventions',
    normalizedForm:
      'Hook calls per hook, names erased; Effect Schema resolver use; local state; storage role; id generation',
    mustBeIdentical:
      'Server state in `use*` hooks through `useTrpc`; one form through React Hook Form and Effect Schema; local state in `use*` hooks; storage in `api-integrations`',
    aspects: conventionAspects,
    freedoms: [{ key: /^id generation$/, freedom: 3, why: 'the generation of `id`' }],
    fixed: [
      { key: scaffoldRole('hooks'), why: SCAFFOLD_FIXED },
      { key: featureRole('hooks'), why: LAYOUT_FIXED },
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

/** `a`, `a and b`, `a, b and c`. */
export const andList = (items) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const publicApiContract = ({ operations, item, createInput }) =>
  `One list query and ${operations.length === 4 ? 'three' : 'two'} mutations for ${andList(operations.slice(1))}; create takes ${andList(
    createInput
      .slice(2, -2)
      .split('; ')
      .map((field) => `\`${field}\``),
  )}; ${operations.includes('toggle') ? 'toggle and delete take' : 'delete takes'} \`id\`; the item has exactly ${andList(Object.entries(item).map(([name, type]) => `\`${type === null ? name : `${name}: ${type}`}\``))}`;

/** Which runs hold another value than the most common one (the earliest on a tie), for a Why cell. */
function whoDiffers(results, aspects) {
  const values = aspects.map((aspect) => cellOf(aspect).value);
  const common = values.reduce((best, value) =>
    values.filter((v) => v === value).length > values.filter((v) => v === best).length
      ? value
      : best,
  );
  const ids = (match) =>
    andList(results.filter((_, i) => (values[i] === common) === match).map((f) => `\`${f.id}\``));
  return `${ids(false)} ${values.filter((v) => v !== common).length === 1 ? 'differs' : 'differ'} from ${ids(true)}`;
}

/** @returns {Verdict} */
const holdsInEveryRun = (aspects) =>
  aspects.every((aspect) => aspect?.kind === 'invariant' && aspect.holds)
    ? { classification: 'identical' }
    : {
        classification: 'outside-spec',
        why: 'the method holds every run to this rule',
        by: 'rule',
      };

/** The freedom every run's `within` value agrees under, or undefined. */
function withinFreedom(aspects) {
  const within = aspects.map((aspect) => (aspect?.kind === 'form' ? aspect.within : undefined));
  return within.every(Boolean) && new Set(within.map((w) => w?.value)).size === 1
    ? within[0]
    : undefined;
}

/** @returns {Verdict} */
function classify(dimension, key, aspects, results) {
  if (aspects.some((aspect) => aspect?.kind === 'invariant')) {
    return holdsInEveryRun(aspects);
  }
  if (new Set(aspects.map((aspect) => cellOf(aspect).value)).size === 1) {
    return { classification: 'identical' };
  }
  const free =
    withinFreedom(aspects) ??
    dimension.freedoms.find((rule) => rule.key.test(key) && (rule.when?.(results) ?? true));
  if (free) {
    return { classification: 'spec-freedom', freedom: free.freedom, why: free.why, by: 'rule' };
  }
  const why =
    dimension.fixed?.find((fixed) => fixed.key.test(key))?.why ??
    'the spec freedoms leave this aspect fixed';
  return {
    classification: 'outside-spec',
    why: key.startsWith('file ') ? `${why}; ${whoDiffers(results, aspects)}` : why,
    by: 'rule',
  };
}

/** No freedom, or the number of one in FREEDOMS; nothing type-checks the JSDoc `Freedom`. */
const isFreedom = (freedom) =>
  freedom === undefined ||
  (Number.isInteger(freedom) && freedom >= 1 && freedom <= FREEDOMS.length);

/** @returns {readonly Difference[]} */
function applyNotes(differences, notes) {
  const noted = new Map(differences.map((difference) => [difference.key, difference]));
  for (const note of notes) {
    if (REVOKED_FREEDOMS.includes(note.freedom)) {
      throw new Error(
        `compare: the author ruling on "${note.key}" names freedom ${note.freedom}, revoked by ADR 0069.`,
      );
    }
    if (!isFreedom(note.freedom)) {
      throw new Error(
        `compare: the author ruling on "${note.key}" names freedom ${note.freedom}; a ruling names one from 1 to ${FREEDOMS.length}.`,
      );
    }
    const difference = noted.get(note.key);
    if (difference?.classification !== 'outside-spec') {
      throw new Error(
        `compare: the author note on "${note.key}" is stale; the comparison has ${difference ? `it as ${difference.classification}` : 'no such aspect'}.`,
      );
    }
    const { dimension, aspect, key, kind, values } = difference;
    const base = { dimension, aspect, key, kind, values, why: note.why };
    noted.set(
      key,
      note.freedom === undefined
        ? { ...base, classification: 'outside-spec', by: 'note' }
        : { ...base, classification: 'spec-freedom', freedom: note.freedom, by: 'ruling' },
    );
  }
  return [...noted.values()];
}

/**
 * Compares the runs dimension by dimension. Every aspect any run has becomes one
 * Difference, identical ones included, in registry order. Classification: an
 * invariant is identical when it holds in every run, else outside the spec; a
 * form is identical when every run has the same value, else inside the first
 * freedom rule that names it, else outside the spec. Each author note then
 * names one outside-spec difference: a ruling moves it into its freedom, a
 * note without one only gives its reason.
 *
 * @param {readonly ResultFacts[]} results
 * @param {readonly AuthorNote[]} [notes]
 * @returns {Comparison}
 * @throws when a note names a missing aspect or one that is not outside the spec, or a ruling
 *   names a freedom FREEDOMS lacks
 */
export function compareResults(results, notes = []) {
  const ids = results.map((facts) => facts.id);
  const differences = applyNotes(
    DIMENSIONS.flatMap((dimension) =>
      alignAspects(dimension, results).map(({ key, aspects }) => ({
        dimension: dimension.id,
        aspect: key,
        key: `${dimension.id} · ${key}`,
        kind: aspects.find(Boolean)?.kind ?? 'form',
        values: new Map(ids.map((id, index) => [id, cellOf(aspects[index])])),
        ...classify(dimension, key, aspects, results),
      })),
    ),
    notes,
  );
  return {
    method: DIMENSIONS.map(({ id, title, normalizedForm, mustBeIdentical }) => ({
      id,
      title,
      normalizedForm,
      mustBeIdentical:
        id === 'public-api'
          ? publicApiContract(BRIEFS[results[0]?.brief ?? 'todo'])
          : mustBeIdentical,
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
