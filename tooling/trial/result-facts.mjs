/**
 * Reads one Todo result into the facts the trial comparison needs (ADR 0035).
 * A result arrives as an in-memory tree, so a landed result (its tracked files)
 * and a failed one (its patch) take one path. Facts come from the committed
 * artifacts first: `architecture.mmd`, the `etc/*.api.md` reports and the
 * package manifests. The sources are parsed syntax-only, with no program and no
 * install, only for what no artifact records: the item shape behind the named
 * types of the API report, the components, the hooks and the storage.
 *
 * @typedef {import('../architecture/contract.mjs').Role} Role
 * @typedef {import('../architecture/contract.mjs').Contract} Contract
 * @typedef {ReadonlyMap<string, string>} ResultTree  result-root-relative path to file text
 *
 * A type as written, and normalized: local named types resolved, `readonly`
 * dropped, fields sorted, the item shape as `Item` and its id type as `Id`.
 * @typedef {{ readonly normalized: string, readonly written: string }} TypeText
 * @typedef {'list' | 'create' | 'toggle' | 'delete'} Operation
 * @typedef {{
 *   readonly path: string,
 *   readonly kind: string,
 *   readonly operation: Operation | null,
 *   readonly input: TypeText,
 *   readonly output: TypeText,
 * }} Procedure  `kind`: `query`, `mutation` or `subscription`, else the member's type name as
 *   written or `(unknown)`; an input or output the member lacks reads `(unknown)`
 * @typedef {{
 *   readonly key: string,
 *   readonly entries: readonly string[],
 *   readonly exports: readonly { readonly name: string, readonly kind: 'value' | 'type' }[],
 * }} ApiReport  keyed `<package>:<role of its entry>`, so a slice name drops out;
 *   `entries`: the result-root-relative entry files its reports read
 * @typedef {{
 *   readonly name: string, readonly role: Role | 'outside-roles', readonly file: string,
 *   readonly props: readonly string[], readonly uiPrimitives: readonly string[],
 *   readonly rawControls: readonly string[], readonly calls: readonly string[],
 * }} Component
 * @typedef {{ readonly name: string, readonly role: Role | 'outside-roles', readonly file: string, readonly calls: readonly string[] }} Hook
 * @typedef {{
 *   readonly dependencies: Readonly<Record<string, string>>,
 *   readonly rest: string,
 * }} Manifest  dependencies keyed `<section> <name>`; the own id reads `{id}`
 * @typedef {{
 *   readonly id: string,
 *   readonly passed: boolean,
 *   readonly verified: boolean,
 *   readonly sourceFiles: ReadonlyMap<string, readonly string[]>,
 *   readonly testFiles: ReadonlyMap<string, readonly string[]>,
 *   readonly diagram: { readonly text: string, readonly roles: readonly string[], readonly edges: readonly { from: string, to: string, typeOnly: boolean }[] },
 *   readonly manifests: Readonly<Record<'web' | 'api', Manifest>>,
 *   readonly procedures: readonly Procedure[],
 *   readonly item: { readonly shape: readonly (readonly [string, string])[], readonly written: string } | null,
 *   readonly apiReports: readonly ApiReport[],
 *   readonly components: readonly Component[],
 *   readonly hooks: readonly Hook[],
 *   readonly outsideFiles: readonly { readonly path: string, readonly text: string }[],
 *   readonly storage: { readonly roles: readonly string[], readonly idSource: string },
 *   readonly flaggedReExports: readonly FlaggedReExport[],
 * }} ResultFacts  `verified`: the run's `verify` check exited 0; `outsideFiles`: see `readOutsideFiles`;
 *   `flaggedReExports`: see `flaggedDrops`
 * @typedef {{ readonly key: string, readonly name: string, readonly kind: 'value' | 'type' }} FlaggedReExport
 *   a re-export a gate flagged in the entry of the ApiReport `key`, which that report no longer lists
 * @typedef {{ readonly file: string, readonly name: string, readonly kind: 'value' | 'type' }} GateFinding
 *   `file`: result-root-relative
 */

import { posix } from 'node:path';
import ts from 'typescript';
import { listPublicEntries } from '../../scripts/api-report.mjs';
import { loadContract } from '../architecture/contract.mjs';
import { streamEvents, unwrapCommand } from './stream.mjs';

const OUTSIDE = 'outside-roles';
const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/** The router key hints that split candidates shape alone leaves tied. */
const HINTS = {
  list: /list|all/i,
  create: /create|add|new/i,
  toggle: /toggle|complete|check|done/i,
  delete: /delete|remove|destroy/i,
};

/**
 * The contract from the text of `.fallowrc.jsonc`. Its zones and rules are
 * literal in the file, so the JSONC parse gives what `fallow config` gives for
 * every showcase path.
 *
 * @param {string} configText
 * @returns {Contract}
 */
export function readContract(configText) {
  const { config, error } = ts.parseConfigFileTextToJson('.fallowrc.jsonc', configText);
  if (error) {
    throw new Error(`compare: .fallowrc.jsonc does not parse: ${error.messageText}`);
  }
  return loadContract(JSON.stringify(config));
}

/** Counts one hunk line against the lines left on each side, keeping an added line. */
function readHunkLine(line, left, body) {
  if (line === undefined) {
    throw new Error('compare: the patch ends inside a hunk');
  }
  const mark = line[0];
  if (mark === '+') {
    body.lines.push(line.slice(1));
  }
  left.old -= mark === '+' || mark === '\\' ? 0 : 1;
  left.new -= mark === '-' || mark === '\\' ? 0 : 1;
}

/** Reads one hunk from `index`; returns the index after it. */
function readHunk(lines, index, body) {
  const counts = HUNK.exec(lines[index]);
  const left = { old: Number(counts?.[1] ?? 1), new: Number(counts?.[2] ?? 1) };
  let at = index + 1;
  while (left.old > 0 || left.new > 0) {
    readHunkLine(lines[at], left, body);
    at += 1;
  }
  if (lines[at]?.startsWith('\\')) {
    body.newline = false;
    at += 1;
  }
  return at;
}

/** One file's diff from its `diff --git` line: its path, whether it is new, its added text. */
function readFileDiff(lines, start) {
  const path = / b\/(.+)$/.exec(lines[start])?.[1] ?? '';
  const header = [];
  let index = start + 1;
  while (index < lines.length && !/^(?:@@|diff --git |-- $)/.test(lines[index])) {
    header.push(lines[index]);
    index += 1;
  }
  const body = { lines: [], newline: true };
  while (lines[index]?.startsWith('@@')) {
    index = readHunk(lines, index, body);
  }
  const text = body.lines.join('\n');
  return {
    path,
    newFile: header.some((line) => line.startsWith('new file mode')),
    text: body.newline && text !== '' ? `${text}\n` : text,
    next: index,
  };
}

/**
 * The files a new-file-only `git format-patch` adds under `root`. Diffs outside
 * `root` (the lockfile) are skipped; a diff under `root` that is not a new file
 * throws, because its text would need the scaffold.
 *
 * @param {string} patch
 * @param {string} root  e.g. 'showcase/todo-01'
 * @returns {ResultTree}
 */
export function treeFromPatch(patch, root) {
  const lines = patch.split('\n');
  const tree = new Map();
  let index = lines.findIndex((line) => line.startsWith('diff --git '));
  while (index !== -1 && lines[index]?.startsWith('diff --git ')) {
    const diff = readFileDiff(lines, index);
    index = diff.next;
    if (!diff.path.startsWith(`${root}/`)) {
      continue;
    }
    if (!diff.newFile) {
      throw new Error(`compare: ${diff.path} is not a new file in the patch`);
    }
    tree.set(diff.path.slice(root.length + 1), diff.text);
  }
  return new Map([...tree].sort(([a], [b]) => (a < b ? -1 : 1)));
}

const isTest = (path) => /\.test\.tsx?$/.test(path) || path.startsWith('web/e2e/');
const isSource = (path) => /^(?:web|api)\/src\/.+\.tsx?$/.test(path) && !isTest(path);
const oneLine = (node) => node.getText().replace(/\s+/g, ' ').trim();
/** Code-unit order, the same on every locale. */
export const sortText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const SCRIPT_KINDS = { tsx: ts.ScriptKind.TSX, jsx: ts.ScriptKind.JSX, js: ts.ScriptKind.JS };

function parse(path, text) {
  const kind = SCRIPT_KINDS[/\.[cm]?([jt]sx?)$/.exec(path)?.[1]] ?? ts.ScriptKind.TS;
  return ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, kind);
}

/** The role of each file, tests by the role of the file they test. */
function filesByRole(tree, roleOf, contract) {
  const sourceFiles = new Map([...contract.roles, OUTSIDE].map((role) => [role, []]));
  const testFiles = new Map([['e2e', []]]);
  for (const path of tree.keys()) {
    if (!isTest(path)) {
      sourceFiles.get(roleOf(path) ?? OUTSIDE).push(path);
      continue;
    }
    const subject = path.replace(/\.test(\.tsx?)$/, '$1');
    const candidates = [
      subject,
      subject.replace(/\.tsx?$/, (ext) => (ext === '.ts' ? '.tsx' : '.ts')),
    ];
    const tested = candidates.find((candidate) => tree.has(candidate));
    const role = path.startsWith('web/e2e/') ? 'e2e' : (roleOf(tested ?? path) ?? OUTSIDE);
    testFiles.set(role, [...(testFiles.get(role) ?? []), path]);
  }
  return { sourceFiles, testFiles };
}

/**
 * Roles and edges of a result diagram; the header line drops out. An edge is
 * type-only when the diagram dashes it or `typeOnlyPairs` holds its pair.
 */
function parseDiagram(text, typeOnlyPairs) {
  const labels = new Map();
  const edges = [];
  for (const line of (text ?? '').split('\n')) {
    const node = /^\s*(\w+)\["([^"]+)"\]$/.exec(line);
    const edge = /^\s*(\w+) (-->|-\.->) (\w+)$/.exec(line);
    if (node && !line.includes('subgraph')) {
      labels.set(node[1], node[2]);
    } else if (edge) {
      edges.push({ from: edge[1], to: edge[3], typeOnly: edge[2] === '-.->' });
    }
  }
  return {
    text: (text ?? '')
      .split('\n')
      .filter((line) => !line.startsWith('%%'))
      .join('\n')
      .trim(),
    roles: [...labels.values()],
    edges: edges.map((edge) => {
      const from = labels.get(edge.from) ?? edge.from;
      const to = labels.get(edge.to) ?? edge.to;
      return { from, to, typeOnly: edge.typeOnly || typeOnlyPairs.has(`${from} ${to}`) };
    }),
  };
}

const allTypes = (elements) => elements.length > 0 && elements.every((e) => e.isTypeOnly);
const namedTypesOnly = (bindings, isNamed) =>
  bindings !== undefined && isNamed(bindings) && allTypes(bindings.elements);

/** Whether an import or re-export brings in types only, the forms Fallow reads as type-only. */
function bringsTypesOnly(statement) {
  if (ts.isExportDeclaration(statement)) {
    return statement.isTypeOnly || namedTypesOnly(statement.exportClause, ts.isNamedExports);
  }
  const clause = statement.importClause;
  return (
    clause !== undefined &&
    (clause.isTypeOnly || (!clause.name && namedTypesOnly(clause.namedBindings, ts.isNamedImports)))
  );
}

const MODULE_CALLS =
  /^(?:import|require|(?:jest|vi)\.(?:mock|doMock|requireActual|unstable_mockModule))$/;

/** Each way a node names a module, as `{ specifier, typeOnly }` or null. */
const REFERENCE_READERS = [
  (node) =>
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
      ? { specifier: node.moduleSpecifier.getText().slice(1, -1), typeOnly: bringsTypesOnly(node) }
      : null,
  (node) =>
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
      ? { specifier: node.argument.literal.text, typeOnly: true }
      : null,
  (node) => {
    const [first] = ts.isCallExpression(node) ? node.arguments : [];
    return first && ts.isStringLiteralLike(first) && MODULE_CALLS.test(node.expression.getText())
      ? { specifier: first.text, typeOnly: false }
      : null;
  },
];

/** Each module specifier of one file, with whether it brings in types only. */
const moduleReferences = (path, text) =>
  descendants(parse(path, text)).flatMap((node) =>
    REFERENCE_READERS.map((read) => read(node)).filter(Boolean),
  );

/** The source forms TypeScript's bundler resolution tries for each specifier extension. */
const RESOLVED_FORMS = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
  '': ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'],
};

/** The tree file a relative specifier from `path` names, the way TypeScript's bundler resolution finds it. */
function resolveRelative(tree, path, specifier) {
  const target = posix.join(posix.dirname(path), specifier);
  const [, stem, ext = ''] = /^(.*?)(\.[cm]?jsx?)?$/.exec(target);
  return [target, ...RESOLVED_FORMS[ext].map((form) => stem + form)].find((candidate) =>
    tree.has(candidate),
  );
}

/**
 * The role pairs `from to` whose every crossing, each import or re-export from
 * a file of one role that may land on a file of the other, brings in types
 * only. Fallow's graph records no import kind, so a result diagram draws such
 * an edge solid where the contract also allows values (ADR 0037). A relative
 * specifier that names no tree file may land anywhere; a specifier of the
 * result's own package may land on any of its roles; any other package
 * specifier on any role no tree file holds, such as `ui`.
 */
function readTypeOnlyPairs(tree, roleOf, contract) {
  const sources = [...tree].filter(([path]) => /\.[cm]?[jt]sx?$/.test(path) && roleOf(path));
  const rolesUnder = (prefix) =>
    new Set(sources.filter(([path]) => path.startsWith(prefix)).map(([path]) => roleOf(path)));
  const held = rolesUnder('');
  const packages = ['web', 'api'].flatMap((dir) => {
    const name = JSON.parse(tree.get(`${dir}/package.json`) ?? '{}').name;
    return name ? [{ name, roles: rolesUnder(`${dir}/`) }] : [];
  });
  const landings = (path, specifier) => {
    if (specifier.startsWith('.')) {
      const target = resolveRelative(tree, path, specifier);
      return target ? [roleOf(target)].filter(Boolean) : contract.roles;
    }
    const own = packages.find(({ name }) => specifier === name || specifier.startsWith(`${name}/`));
    return [...(own?.roles ?? contract.roles.filter((role) => !held.has(role)))];
  };
  const pairs = new Map();
  for (const [path, text] of sources) {
    const from = roleOf(path);
    for (const { specifier, typeOnly } of moduleReferences(path, text)) {
      for (const to of landings(path, specifier).filter((role) => role !== from)) {
        pairs.set(`${from} ${to}`, (pairs.get(`${from} ${to}`) ?? true) && typeOnly);
      }
    }
  }
  return new Set([...pairs].filter(([, typeOnly]) => typeOnly).map(([pair]) => pair));
}

function canonical(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort(sortText);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** @returns {Manifest} */
function readManifest(text, id) {
  if (text === undefined) {
    return { dependencies: {}, rest: '(absent)' };
  }
  const manifest = JSON.parse(text.replaceAll(`@${id}/`, '@{id}/'));
  const dependencies = {};
  const rest = {};
  for (const [field, value] of Object.entries(manifest)) {
    if (field.endsWith('ependencies')) {
      for (const [name, range] of Object.entries(value)) {
        dependencies[`${field} ${name}`] = range;
      }
    } else {
      rest[field] = value;
    }
  }
  return { dependencies, rest: canonical(rest) };
}

/** The fenced ```ts block of an API Extractor report, which API Extractor writes with CRLF. */
function parseReport(text) {
  const code = /```ts\n([\s\S]*?)\n```/.exec((text ?? '').replaceAll('\r\n', '\n'))?.[1] ?? '';
  return parse('report.ts', code);
}

const isExported = (statement) =>
  (ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined)?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  ) ?? false;

/** Each export of a report: functions, consts, classes and enums are values; the rest types. */
function parseReportExports(sourceFile) {
  return sourceFile.statements.filter(isExported).flatMap((statement) => {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.map((declaration) => ({
        name: declaration.name.getText(),
        kind: 'value',
      }));
    }
    const kind =
      ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)
        ? 'type'
        : 'value';
    return statement.name ? [{ name: statement.name.getText(), kind }] : [];
  });
}

/** Every API report, keyed by package and the role of its entry; one key merges its reports. */
function readApiReports(tree, root, roleOf) {
  const files = [...tree.keys()].map((path) => `${root}/${path}`);
  const local = (path) => path.slice(root.length + 1);
  const entries = listPublicEntries(files, (path) => JSON.parse(tree.get(local(path)) ?? '{}'));
  const reports = new Map();
  for (const { name, entry, packageRoot } of entries) {
    const key = `${packageRoot.split('/').pop()}:${roleOf(local(entry)) ?? OUTSIDE}`;
    const text = tree.get(`${local(packageRoot)}/etc/${name}.api.md`);
    const exports = text === undefined ? [] : parseReportExports(parseReport(text));
    const report = reports.get(key) ?? { key, entries: [], exports: [] };
    reports.set(key, {
      key,
      entries: [...report.entries, local(entry)],
      exports: [...report.exports, ...exports],
    });
  }
  return [...reports.values()]
    .sort((a, b) => sortText(a.key, b.key))
    .map((report) => ({
      ...report,
      exports: report.exports.sort((a, b) => sortText(a.name, b.name)),
    }));
}

const memberType = (literal, name) =>
  literal.members.find((member) => member.name?.getText() === name)?.type;

const PROCEDURE_KINDS = new Map([
  ['TRPCQueryProcedure', 'query'],
  ['TRPCMutationProcedure', 'mutation'],
  ['TRPCSubscriptionProcedure', 'subscription'],
]);
const UNKNOWN = '(unknown)';
const unquote = (name) => name.getText().replace(/^['"]|['"]$/g, '');

/** The `{ key: procedure }` literal inside a TRPCBuiltRouter type, or null. */
function routerLiteral(router) {
  const options = router.typeArguments?.[1];
  const literal =
    options && ts.isTypeReferenceNode(options) ? options.typeArguments?.[0] : undefined;
  return literal && ts.isTypeLiteralNode(literal) ? literal : null;
}

/** Every procedure of the router a member holds, else the member as one procedure. */
function memberProcedures(member, prefix) {
  const path = `${prefix}${member.name ? unquote(member.name) : UNKNOWN}`;
  const type = member.type && ts.isTypeReferenceNode(member.type) ? member.type : undefined;
  const name = type?.typeName.getText();
  if (name === 'TRPCBuiltRouter') {
    return walkRouter(type, `${path}.`);
  }
  return [procedureOf(path, name, type?.typeArguments?.[0])];
}

/**
 * One router member as a procedure. A known kind with an `{ input; output }`
 * definition reads as that kind; any other member keeps its type name as its
 * kind, so the operations check counts it instead of losing it.
 */
function procedureOf(path, typeName, definition) {
  const [input, output] = definitionTypes(definition);
  const kind = (input && output && PROCEDURE_KINDS.get(typeName)) || (typeName ?? UNKNOWN);
  return { path, kind, input, output };
}

/** `[input, output]` of an `{ input; output; meta }` definition, each null when absent. */
function definitionTypes(definition) {
  if (!definition || !ts.isTypeLiteralNode(definition)) {
    return [null, null];
  }
  return [memberType(definition, 'input') ?? null, memberType(definition, 'output') ?? null];
}

/** The procedures of a TRPCBuiltRouter type, nested routers flattened into dotted paths. */
function walkRouter(router, prefix) {
  return routerLiteral(router)?.members.flatMap((member) => memberProcedures(member, prefix)) ?? [];
}

/** The router value of the api package's own report: the one export typed TRPCBuiltRouter. */
function parseRouter(text) {
  const sourceFile = parseReport(text);
  for (const statement of sourceFile.statements.filter(ts.isVariableStatement)) {
    for (const declaration of statement.declarationList.declarations) {
      const type = declaration.type;
      if (type && ts.isTypeReferenceNode(type) && type.typeName.getText() === 'TRPCBuiltRouter') {
        return walkRouter(type, '');
      }
    }
  }
  return [];
}

/** `[name, type]` for an interface or alias without type parameters, else null. */
function declarationOf(statement) {
  if (ts.isInterfaceDeclaration(statement) && !statement.heritageClauses) {
    return statement.typeParameters ? null : [statement.name.text, statement];
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    return statement.typeParameters ? null : [statement.name.text, statement.type];
  }
  return null;
}

/**
 * The interfaces and aliases declared in the api sources, by name. A name
 * declared twice with different text resolves to nothing, so its type stays
 * as written and the method sees a difference.
 */
function collectTypeDeclarations(tree) {
  const declarations = [...tree]
    .filter(([path]) => path.startsWith('api/') && isSource(path))
    .flatMap(([path, text]) => parse(path, text).statements.map(declarationOf).filter(Boolean));
  const types = new Map();
  for (const [name, declared] of declarations) {
    const previous = types.get(name);
    const agrees = previous === undefined || (previous && oneLine(previous) === oneLine(declared));
    types.set(name, agrees ? declared : null);
  }
  return types;
}

/**
 * @typedef {{ types: Map<string, ts.Node | null>, item: string | null, idType: string | null }} TypeContext
 */

/** @param {TypeContext} context */
function normalize(node, context, seen = new Set()) {
  const text = shapeText(node, context, seen);
  return context.item !== null && text === context.item ? 'Item' : text;
}

function membersText(members, context, seen) {
  const fields = members
    .map((member) => {
      if (!ts.isPropertySignature(member) || !member.type) {
        return oneLine(member).replace(/;$/, '');
      }
      const name = member.name.getText().replace(/^['"]|['"]$/g, '');
      const type = normalize(member.type, context, seen);
      const shown =
        name === 'id' && context.idType !== null && type === context.idType ? 'Id' : type;
      return `${name}${member.questionToken ? '?' : ''}: ${shown}`;
    })
    .sort(sortText);
  return fields.length === 0 ? '{}' : `{ ${fields.join('; ')} }`;
}

/** The declaration a local type name stands for, or null. */
function resolveName(node, context, seen) {
  if (!ts.isTypeReferenceNode(node) || node.typeArguments || !ts.isIdentifier(node.typeName)) {
    return null;
  }
  const name = node.typeName.text;
  const declared = context.types.get(name);
  return declared && !seen.has(name) ? { declared, seen: new Set([...seen, name]) } : null;
}

const unwrap = (node) =>
  ts.isParenthesizedTypeNode(node) ||
  (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword)
    ? node.type
    : node;

/** @param {TypeContext} context */
function shapeText(node, context, seen) {
  if (unwrap(node) !== node) {
    return normalize(unwrap(node), context, seen);
  }
  if (ts.isArrayTypeNode(node)) {
    const element = normalize(node.elementType, context, seen);
    return ts.isUnionTypeNode(node.elementType) ? `(${element})[]` : `${element}[]`;
  }
  if (ts.isTypeLiteralNode(node) || ts.isInterfaceDeclaration(node)) {
    return membersText(node.members, context, seen);
  }
  const types = ts.isUnionTypeNode(node) ? node.types : null;
  if (types) {
    return types
      .map((type) => normalize(type, context, seen))
      .sort(sortText)
      .join(' | ');
  }
  const resolved = resolveName(node, context, seen);
  return resolved ? normalize(resolved.declared, context, resolved.seen) : oneLine(node);
}

/** The object members a type stands for, through `readonly`, parentheses and local names. */
function membersOf(node, context, seen = new Set()) {
  if (ts.isTypeLiteralNode(node) || ts.isInterfaceDeclaration(node)) {
    return node.members;
  }
  if (ts.isParenthesizedTypeNode(node) || ts.isTypeOperatorNode(node)) {
    return membersOf(node.type, context, seen);
  }
  const resolved = resolveName(node, context, seen);
  return resolved ? membersOf(resolved.declared, context, resolved.seen) : null;
}

/** The no-input queries whose output is an array: the candidates for list. */
const listCandidates = (procedures, inputOf) =>
  procedures.filter(
    (p) => p.kind === 'query' && takesNothing(inputOf(p)) && elementOf(p.output) !== null,
  );

const elementOf = (node) => {
  const inner = ts.isTypeOperatorNode(node) || ts.isParenthesizedTypeNode(node) ? node.type : node;
  return ts.isArrayTypeNode(inner) ? inner.elementType : null;
};

/** The unique candidate, else the unique one whose last key segment carries the hint. */
function byHint(candidates, hint) {
  const named = candidates.filter((candidate) => hint.test(candidate.path.split('.').pop()));
  return named.length === 1 ? named[0] : undefined;
}
const pick = (candidates, hint) =>
  candidates.length === 1 ? candidates[0] : byHint(candidates, hint);

/**
 * Operations by shape: the query with no input and an array output is list;
 * the mutation that takes exactly `{ title: string }` is create; of the
 * mutations that take exactly `{ id }`, the one returning the item is toggle
 * and the other delete.
 * The key name only breaks a tie shape leaves; an open tie stays null.
 */
function recognizeOperations(procedures, normalized) {
  const operations = new Map();
  const queries = listCandidates(procedures, (p) => normalized.get(p).input);
  const mutations = procedures.filter((p) => p.kind === 'mutation');
  const takes = (input) => mutations.filter((p) => normalized.get(p).input === input);
  const byId = takes('{ id: Id }');
  const returnsItem = byId.filter((p) => normalized.get(p).output === 'Item');
  const split = returnsItem.length === 1 && byId.length === 2;
  const toggle = split ? returnsItem[0] : byHint(byId, HINTS.toggle);
  const remove = split ? byId.find((p) => p !== toggle) : byHint(byId, HINTS.delete);
  for (const [operation, procedure] of [
    ['list', pick(queries, HINTS.list)],
    ['create', pick(takes('{ title: string }'), HINTS.create)],
    ...(toggle !== remove
      ? [
          ['toggle', toggle],
          ['delete', remove],
        ]
      : []),
  ]) {
    if (procedure) {
      operations.set(procedure, operation);
    }
  }
  return operations;
}

const takesNothing = (input) => /^(void|undefined)$/.test(input);

/** The element of the list query's output, its members and its fields as `[name, type]`. */
function readItem(parsed, types) {
  const bare = { types, item: null, idType: null };
  const list = listCandidates(parsed, (p) => normalize(p.input, bare))[0];
  const element = list ? elementOf(list.output) : null;
  const members = element ? membersOf(element, bare) : null;
  if (!element || !members) {
    return null;
  }
  const shape = members
    .filter((member) => ts.isPropertySignature(member) && member.type)
    .map((member) => [
      `${member.name.getText()}${member.questionToken ? '?' : ''}`,
      normalize(member.type, bare),
    ])
    .sort(([a], [b]) => sortText(a, b));
  return { element, shape, idType: shape.find(([name]) => name === 'id')?.[1] ?? null };
}

/** The procedures and the listed item of the api package's own report. */
function readProcedures(tree) {
  const parsed = parseRouter(tree.get('api/etc/api.api.md'));
  const types = collectTypeDeclarations(tree);
  const item = readItem(parsed, types);
  const idType = item?.idType ?? null;
  const context = {
    types,
    item: item ? normalize(item.element, { types, item: null, idType }) : null,
    idType,
  };
  const normalizedOf = (node) => (node ? normalize(node, context) : UNKNOWN);
  const normalized = new Map(
    parsed.map((p) => [p, { input: normalizedOf(p.input), output: normalizedOf(p.output) }]),
  );
  const written = (node) => (node ? oneLine(node) : UNKNOWN);
  const operations = recognizeOperations(parsed, normalized);
  return {
    item: item ? { shape: item.shape, written: oneLine(item.element) } : null,
    procedures: parsed.map((p) => ({
      path: p.path,
      kind: p.kind,
      operation: operations.get(p) ?? null,
      input: { normalized: normalized.get(p).input, written: written(p.input) },
      output: { normalized: normalized.get(p).output, written: written(p.output) },
    })),
  };
}

/** The function a wrapper call such as `memo(...)` or `forwardRef(...)` holds, through nested wrappers. */
function unwrapCall(node) {
  if (node && ts.isCallExpression(node)) {
    return unwrapCall(node.arguments[0]);
  }
  return node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) ? node : undefined;
}

/** Top-level functions, declared or bound to a const, wrapper calls unwrapped, with their bodies. */
function functionsOf(sourceFile) {
  return sourceFile.statements.flatMap((statement) => {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      return [{ name: statement.name.text, node: statement }];
    }
    if (!ts.isVariableStatement(statement)) {
      return [];
    }
    return statement.declarationList.declarations.flatMap((declaration) => {
      const node = unwrapCall(declaration.initializer);
      return ts.isIdentifier(declaration.name) && node
        ? [{ name: declaration.name.text, node }]
        : [];
    });
  });
}

function descendants(node) {
  const found = [];
  const visit = (child) => {
    found.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

/** The name a call calls: `useY` for `useY()` and for `X.useY()`, else null. */
function calleeName(node) {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
}

/** Called hooks, form resolvers and the Effect Standard Schema adapter, by name, sorted. */
const callsIn = (nodes) =>
  nodes
    .filter(ts.isCallExpression)
    .map(calleeName)
    .filter(
      (name) =>
        name !== null &&
        (/^use[A-Z]/.test(name) || /Resolver$/.test(name) || name === 'toStandardSchemaV1'),
    )
    .sort(sortText);

/** The intrinsic control a JSX element is, or null. */
function controlOf(element) {
  const tag = element.tagName.getText();
  if (tag === 'input') {
    const type = element.attributes.properties.find(
      (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === 'type',
    );
    const value =
      type?.initializer && ts.isStringLiteral(type.initializer) ? type.initializer.text : 'text';
    return `input:${value}`;
  }
  return ['button', 'select', 'textarea'].includes(tag) ? tag : null;
}

/** Prop kinds of a component's first parameter: `fn/<arity>` for a function prop, else `value`. */
function propsOf(fn, sourceFile) {
  const type = fn.parameters?.[0]?.type;
  let members = type && ts.isTypeLiteralNode(type) ? type.members : null;
  if (type && ts.isTypeReferenceNode(type)) {
    const name = type.typeName.getText();
    const declared = sourceFile.statements.find(
      (statement) =>
        (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
        statement.name.text === name,
    );
    members =
      declared &&
      (ts.isInterfaceDeclaration(declared)
        ? declared.members
        : membersOf(declared.type, { types: new Map() }));
  }
  return (members ?? [])
    .map((member) =>
      ts.isPropertySignature(member) && member.type && ts.isFunctionTypeNode(member.type)
        ? `fn/${member.type.parameters.length}`
        : 'value',
    )
    .sort(sortText);
}

const unique = (values) => [...new Set(values)].sort(sortText);

function scanComponent(name, fn, sourceFile, inner, uiImports) {
  const elements = inner.filter(
    (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node),
  );
  return {
    name,
    props: propsOf(fn, sourceFile),
    uiPrimitives: unique(
      elements.map((element) => element.tagName.getText()).filter((tag) => uiImports.has(tag)),
    ),
    rawControls: unique(elements.map(controlOf).filter(Boolean)),
    calls: callsIn(inner),
  };
}

function uiImportsOf(sourceFile) {
  return new Set(
    sourceFile.statements
      .filter(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.getText().slice(1, -1) === '@repo/ui',
      )
      .flatMap((statement) => {
        const bindings = statement.importClause?.namedBindings;
        return bindings && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => element.name.text)
          : [];
      }),
  );
}

const holdsJsx = (nodes) =>
  nodes.some(
    (node) => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node),
  );

/** The hooks (`use*` functions) and components (PascalCase functions rendering JSX) of one file. */
function scanWebFile(path, text, role) {
  const sourceFile = parse(path, text);
  const uiImports = uiImportsOf(sourceFile);
  const found = { components: [], hooks: [] };
  for (const { name, node } of functionsOf(sourceFile)) {
    const inner = descendants(node);
    if (/^use[A-Z]/.test(name)) {
      found.hooks.push({ name, role, file: path, calls: callsIn(inner) });
    } else if (/^[A-Z]/.test(name) && path.endsWith('.tsx') && holdsJsx(inner)) {
      const component = scanComponent(name, node, sourceFile, inner, uiImports);
      found.components.push({ ...component, role, file: path });
    }
  }
  return found;
}

/** Components and hooks of the web sources. */
function scanWeb(tree, roleOf) {
  const files = [...tree]
    .filter(([path]) => path.startsWith('web/') && isSource(path))
    .map(([path, text]) => scanWebFile(path, text, roleOf(path) ?? OUTSIDE));
  const order = (a, b) => sortText(a.file, b.file) || sortText(a.name, b.name);
  return {
    components: files.flatMap((file) => file.components).sort(order),
    hooks: files.flatMap((file) => file.hooks).sort(order),
  };
}

const COLLECTIONS = new Set(['Map', 'Set', 'WeakMap', 'Array']);
const MUTATORS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);
const ASSIGNMENTS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
]);

/** The name an expression is rooted at: `todos` for `todos`, `todos[0].title` and `todos.items`. */
function rootName(node) {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return rootName(node.expression);
  }
  return ts.isIdentifier(node) ? node.text : null;
}

const INCREMENTS = new Set([ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken]);

/** The target of an assignment (`=`, `+=`, ...) or an increment, else undefined. */
function assignedBy(node) {
  if (ts.isBinaryExpression(node)) {
    return ASSIGNMENTS.has(node.operatorToken.kind) ? node.left : undefined;
  }
  const unary = ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node);
  return unary && INCREMENTS.has(node.operator) ? node.operand : undefined;
}

/** The value a `delete` or a mutating method call (`push`, `splice`, ...) changes in place, else undefined. */
function mutatedBy(node) {
  if (ts.isDeleteExpression(node)) {
    return node.expression;
  }
  const method = ts.isCallExpression(node) ? node.expression : undefined;
  return method && ts.isPropertyAccessExpression(method) && MUTATORS.has(method.name.text)
    ? method.expression
    : undefined;
}

/** The names a file reassigns (`=`, `+=`, `++`) and the names whose value it mutates in place. */
function writesIn(inner) {
  const reassigned = new Set();
  const mutated = new Set();
  for (const node of inner) {
    const assigned = assignedBy(node);
    const changed = assigned ?? mutatedBy(node);
    if (changed) {
      (assigned && ts.isIdentifier(assigned) ? reassigned : mutated).add(rootName(changed));
    }
  }
  return { reassigned, mutated };
}

const isLiteral = (value) =>
  value !== undefined &&
  (ts.isArrayLiteralExpression(value) || ts.isObjectLiteralExpression(value));
const isCollection = (value) =>
  value !== undefined && ts.isNewExpression(value) && COLLECTIONS.has(value.expression.getText());

/**
 * Module-level mutable state: a `new Map`/`Set`/`Array`, an array or object
 * literal bound with `let`, a `let` the file reassigns, or an array or object
 * literal the file mutates in place. A `const` literal left alone is a constant.
 */
function holdsState(statement, writes) {
  const isLet = (statement.declarationList.flags & ts.NodeFlags.Let) !== 0;
  return statement.declarationList.declarations.some(({ name, initializer }) => {
    const bound = ts.isIdentifier(name) ? name.text : null;
    const literal = isLiteral(initializer);
    return (
      isCollection(initializer) ||
      (isLet && (literal || writes.reassigned.has(bound))) ||
      (literal && writes.mutated.has(bound))
    );
  });
}

/** Module-level numeric `let`s that a function increments. */
function counters(sourceFile, inner) {
  const numeric = sourceFile.statements
    .filter(ts.isVariableStatement)
    .filter((statement) => statement.declarationList.flags & ts.NodeFlags.Let)
    .flatMap((statement) => statement.declarationList.declarations)
    .filter(
      (declaration) => declaration.initializer && ts.isNumericLiteral(declaration.initializer),
    )
    .map((declaration) => declaration.name.getText());
  const bumped = inner
    .filter(
      (node) =>
        (ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) ||
        ts.isPrefixUnaryExpression(node) ||
        ts.isPostfixUnaryExpression(node),
    )
    .map((node) => (ts.isBinaryExpression(node) ? node.left : node.operand).getText());
  return numeric.filter((name) => bumped.includes(name));
}

/** Where the api keeps its todos, and how it makes an id. */
function scanStorage(tree, roleOf) {
  const roles = new Set();
  const sources = new Set();
  for (const [path, text] of tree) {
    if (!path.startsWith('api/') || !isSource(path)) {
      continue;
    }
    const sourceFile = parse(path, text);
    const inner = descendants(sourceFile);
    const writes = writesIn(inner);
    if (
      sourceFile.statements
        .filter(ts.isVariableStatement)
        .some((statement) => holdsState(statement, writes))
    ) {
      roles.add(roleOf(path) ?? OUTSIDE);
    }
    const uuid = inner.some(
      (node) =>
        ts.isCallExpression(node) &&
        (ts.isIdentifier(node.expression) || ts.isPropertyAccessExpression(node.expression)) &&
        (ts.isIdentifier(node.expression) ? node.expression : node.expression.name).text ===
          'randomUUID',
    );
    if (uuid) {
      sources.add('randomUUID');
    }
    if (counters(sourceFile, inner).length > 0) {
      sources.add('counter');
    }
  }
  return { roles: unique(roles), idSource: unique(sources).join('+') || 'unrecognized' };
}

const MANIFESTS = new Set(['web/package.json', 'api/package.json']);
const isGenerated = (path) =>
  path === 'architecture.mmd' || /^(?:web|api)\/etc\/[^/]+\.api\.md$/.test(path);

/**
 * The files outside every role that no other aspect compares (manifests,
 * generated artifacts and tests are compared elsewhere), with the result's own
 * id as `{id}` and CRLF as LF.
 */
function readOutsideFiles(tree, roleOf, id) {
  return [...tree]
    .filter(
      ([path]) =>
        roleOf(path) === undefined && !MANIFESTS.has(path) && !isGenerated(path) && !isTest(path),
    )
    .map(([path, text]) => ({
      path,
      text: text.replaceAll('\r\n', '\n').replaceAll(id, '{id}'),
    }));
}

/** A shell command that runs a gate which prints Fallow's findings. */
const GATE_COMMAND =
  /\bpnpm\s+(?:run\s+)?(?:verify|fallow:audit)\b|\bfallow\s+(?:audit|dead-code)\b/;

const contentBlocks = (event) =>
  Array.isArray(event.message?.content) ? event.message.content : [];

const resultText = (content) =>
  typeof content === 'string'
    ? content
    : (Array.isArray(content) ? content : [])
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('\n');

/**
 * The text of every tool result whose call was a Bash command that runs a gate,
 * whether its content is a string or text blocks. Any other tool, or a command
 * such as `printf`, can print text shaped like a finding.
 */
function gateResultTexts(streamText) {
  const events = streamEvents(streamText);
  const blocks = events.flatMap(contentBlocks);
  const gateCalls = new Set(
    blocks
      .filter((block) => block?.type === 'tool_use' && block.name === 'Bash')
      .filter((block) => GATE_COMMAND.test(String(block.input?.command ?? '')))
      .map((block) => block.id),
  );
  return [
    ...blocks
      .filter((block) => block?.type === 'tool_result' && gateCalls.has(block.tool_use_id))
      .map((block) => resultText(block.content)),
    ...events
      .filter(
        (event) =>
          event.type === 'item.completed' &&
          event.item?.type === 'command_execution' &&
          GATE_COMMAND.test(unwrapCommand(event.item.command ?? '')),
      )
      .map((event) => event.item.aggregated_output ?? ''),
  ];
}

/** An ANSI color code; built from ESC's code, since a control character in a regex literal reads as a mistake. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const UNUSED_SECTION = /^● Unused (type )?exports \(\d+\)$/;
const FINDING = /^ {4}:\d+ (\S+) \(re-export\)$/;

/** The section a `fallow audit` line opens: its export kind, null for any other section. */
const sectionKind = (line) => {
  const section = UNUSED_SECTION.exec(line);
  return section ? (section[1] ? 'type' : 'value') : null;
};

/**
 * Each unused re-export in one tool result, as `fallow audit` prints it: a
 * `● Unused exports` or `● Unused type exports` section, a file line indented
 * two spaces, a `:<line> <Name> (re-export)` line indented four.
 *
 * @returns {readonly { file: string, name: string, kind: 'value' | 'type' }[]}
 */
function auditReExports(text) {
  const found = [];
  let kind = null;
  let file = null;
  for (const line of text.replace(ANSI, '').split(/\r?\n/)) {
    const name = FINDING.exec(line)?.[1];
    if (/^\S/.test(line)) {
      kind = sectionKind(line);
      file = null;
    } else if (/^ {2}\S+$/.test(line)) {
      file = line.trim();
    } else if (name && kind && file) {
      found.push({ file, name, kind });
    }
  }
  return found;
}

/**
 * Every re-export a gate in the run's own stream reported unused. Only files
 * under `root` count, so a run is judged by the findings on its own code.
 *
 * @param {string | null} streamText
 * @param {string} root
 * @returns {readonly GateFinding[]}
 */
export function readGateFindings(streamText, root) {
  const found = new Map();
  const findings = streamText === null ? [] : gateResultTexts(streamText).flatMap(auditReExports);
  for (const { file, name, kind } of findings.filter((f) => f.file.startsWith(`${root}/`))) {
    const local = file.slice(root.length + 1);
    found.set(`${local} ${name} ${kind}`, { file: local, name, kind });
  }
  return [...found].sort(([a], [b]) => sortText(a, b)).map(([, finding]) => finding);
}

/**
 * The findings that explain a dropped re-export: on the entry file an API
 * report reads, for a name that report no longer exports. A finding on an
 * internal file leaves the public API as it was.
 *
 * @param {readonly GateFinding[]} findings
 * @param {readonly ApiReport[]} reports
 * @returns {readonly FlaggedReExport[]}
 */
function flaggedDrops(findings, reports) {
  return findings.flatMap(({ file, name, kind }) => {
    const report = reports.find((candidate) => candidate.entries.includes(file));
    const dropped = report && !report.exports.some((entry) => entry.name === name);
    return dropped ? [{ key: report.key, name, kind }] : [];
  });
}

/**
 * @param {{ id: string, root: string, passed: boolean, verified: boolean, tree: ResultTree, contract: Contract, streamText?: string | null }} input
 *   `streamText`: the run's committed stream, or null when it has none
 * @returns {ResultFacts}
 */
export function readResultFacts({ id, root, passed, verified, tree, contract, streamText = null }) {
  const roleOf = (path) => contract.roleOf(`${root}/${path}`);
  const apiReports = readApiReports(tree, root, roleOf);
  return {
    id,
    passed,
    verified,
    ...filesByRole(tree, roleOf, contract),
    diagram: parseDiagram(tree.get('architecture.mmd'), readTypeOnlyPairs(tree, roleOf, contract)),
    manifests: {
      web: readManifest(tree.get('web/package.json'), id),
      api: readManifest(tree.get('api/package.json'), id),
    },
    ...readProcedures(tree),
    apiReports,
    ...scanWeb(tree, roleOf),
    outsideFiles: readOutsideFiles(tree, roleOf, id),
    storage: scanStorage(tree, roleOf),
    flaggedReExports: flaggedDrops(readGateFindings(streamText, root), apiReports),
  };
}
