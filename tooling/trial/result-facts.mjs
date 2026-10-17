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
 *   readonly kind: 'query' | 'mutation',
 *   readonly operation: Operation | null,
 *   readonly input: TypeText,
 *   readonly output: TypeText,
 * }} Procedure
 * @typedef {{
 *   readonly key: string,
 *   readonly exports: readonly { readonly name: string, readonly kind: 'value' | 'type' }[],
 * }} ApiReport  keyed `<package>:<role of its entry>`, so a slice name drops out
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
 *   readonly sourceFiles: ReadonlyMap<string, readonly string[]>,
 *   readonly testFiles: ReadonlyMap<string, readonly string[]>,
 *   readonly diagram: { readonly text: string, readonly roles: readonly string[], readonly edges: readonly { from: string, to: string, typeOnly: boolean }[] },
 *   readonly manifests: Readonly<Record<'web' | 'api', Manifest>>,
 *   readonly procedures: readonly Procedure[],
 *   readonly item: { readonly shape: readonly (readonly [string, string])[], readonly written: string } | null,
 *   readonly apiReports: readonly ApiReport[],
 *   readonly components: readonly Component[],
 *   readonly hooks: readonly Hook[],
 *   readonly storage: { readonly roles: readonly string[], readonly idSource: string },
 * }} ResultFacts
 */

import ts from 'typescript';
import { listPublicEntries } from '../../scripts/api-report.mjs';
import { loadContract } from '../architecture/contract.mjs';

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
const sortText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function parse(path, text) {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
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

/** Roles and edges of a result diagram; the header line drops out. `-.->` is a type-only edge. */
function parseDiagram(text) {
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
    edges: edges.map((edge) => ({
      ...edge,
      from: labels.get(edge.from) ?? edge.from,
      to: labels.get(edge.to) ?? edge.to,
    })),
  };
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
    reports.set(key, [...(reports.get(key) ?? []), ...exports]);
  }
  return [...reports]
    .sort(([a], [b]) => sortText(a, b))
    .map(([key, exports]) => ({
      key,
      exports: exports.sort((a, b) => sortText(a.name, b.name)),
    }));
}

const memberType = (literal, name) =>
  literal.members.find((member) => member.name?.getText() === name)?.type;

const PROCEDURE_KINDS = { TRPCQueryProcedure: 'query', TRPCMutationProcedure: 'mutation' };
const unquote = (name) => name.getText().replace(/^['"]|['"]$/g, '');

/** The `{ key: procedure }` literal inside a TRPCBuiltRouter type, or null. */
function routerLiteral(router) {
  const options = router.typeArguments?.[1];
  const literal =
    options && ts.isTypeReferenceNode(options) ? options.typeArguments?.[0] : undefined;
  return literal && ts.isTypeLiteralNode(literal) ? literal : null;
}

/** The procedure a router member holds, or every procedure of the router it holds. */
function memberProcedures(member, prefix) {
  const type = member.type;
  if (!type || !ts.isTypeReferenceNode(type)) {
    return [];
  }
  const path = `${prefix}${unquote(member.name)}`;
  const name = type.typeName.getText();
  if (name === 'TRPCBuiltRouter') {
    return walkRouter(type, `${path}.`);
  }
  return procedureOf(path, PROCEDURE_KINDS[name], type.typeArguments?.[0]);
}

/** One procedure from its `{ input; output; meta }` definition, or none when the type is another. */
function procedureOf(path, kind, definition) {
  if (!kind || !definition || !ts.isTypeLiteralNode(definition)) {
    return [];
  }
  const input = memberType(definition, 'input');
  const output = memberType(definition, 'output');
  return input && output ? [{ path, kind, input, output }] : [];
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
 * Operations by shape: the query with no input is list; the mutation that
 * takes exactly `{ title: string }` is create; of the mutations that take
 * exactly `{ id }`, the one returning the item is toggle and the other delete.
 * The key name only breaks a tie shape leaves; an open tie stays null.
 */
function recognizeOperations(procedures, normalized) {
  const operations = new Map();
  const queries = procedures.filter(
    (p) => p.kind === 'query' && takesNothing(normalized.get(p).input),
  );
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
  const list = parsed.find((p) => p.kind === 'query' && takesNothing(normalize(p.input, bare)));
  const element = list ? elementOf(list.output) : null;
  const members = element ? membersOf(element, bare) : null;
  if (!element || !members) {
    return null;
  }
  const shape = members
    .filter((member) => ts.isPropertySignature(member) && member.type)
    .map((member) => [member.name.getText(), normalize(member.type, bare)])
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
  const normalized = new Map(
    parsed.map((p) => [
      p,
      { input: normalize(p.input, context), output: normalize(p.output, context) },
    ]),
  );
  const operations = recognizeOperations(parsed, normalized);
  return {
    item: item ? { shape: item.shape, written: oneLine(item.element) } : null,
    procedures: parsed.map((p) => ({
      path: p.path,
      kind: p.kind,
      operation: operations.get(p) ?? null,
      input: { normalized: normalized.get(p).input, written: oneLine(p.input) },
      output: { normalized: normalized.get(p).output, written: oneLine(p.output) },
    })),
  };
}

/** Top-level functions, declared or bound to a const, with their bodies. */
function functionsOf(sourceFile) {
  return sourceFile.statements.flatMap((statement) => {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      return [{ name: statement.name.text, node: statement }];
    }
    if (!ts.isVariableStatement(statement)) {
      return [];
    }
    return statement.declarationList.declarations
      .filter(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer)),
      )
      .map((declaration) => ({ name: declaration.name.getText(), node: declaration.initializer }));
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

/** Called hooks and form resolvers, by name, sorted. */
const callsIn = (nodes) =>
  nodes
    .filter((node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression))
    .map((node) => node.expression.text)
    .filter((name) => /^use[A-Z]/.test(name) || /Resolver$/.test(name))
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

const COLLECTIONS = new Set(['Map', 'Set', 'WeakMap']);

/** Module-level collections: a `new Map`/`Set` or an array literal. */
function holdsCollection(declaration) {
  const value = declaration.initializer;
  return (
    value !== undefined &&
    ((ts.isNewExpression(value) && COLLECTIONS.has(value.expression.getText())) ||
      ts.isArrayLiteralExpression(value))
  );
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
    const declarations = sourceFile.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations);
    if (declarations.some(holdsCollection)) {
      roles.add(roleOf(path) ?? OUTSIDE);
    }
    const inner = descendants(sourceFile);
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

/**
 * @param {{ id: string, root: string, passed: boolean, tree: ResultTree, contract: Contract }} input
 * @returns {ResultFacts}
 */
export function readResultFacts({ id, root, passed, tree, contract }) {
  const roleOf = (path) => contract.roleOf(`${root}/${path}`);
  return {
    id,
    passed,
    ...filesByRole(tree, roleOf, contract),
    diagram: parseDiagram(tree.get('architecture.mmd')),
    manifests: {
      web: readManifest(tree.get('web/package.json'), id),
      api: readManifest(tree.get('api/package.json'), id),
    },
    ...readProcedures(tree),
    apiReports: readApiReports(tree, root, roleOf),
    ...scanWeb(tree, roleOf),
    storage: scanStorage(tree, roleOf),
  };
}
