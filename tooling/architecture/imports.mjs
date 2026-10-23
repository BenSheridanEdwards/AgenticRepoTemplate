import { posix } from 'node:path';
import ts from 'typescript';

const SCRIPT_KINDS = { tsx: ts.ScriptKind.TSX, jsx: ts.ScriptKind.JSX, js: ts.ScriptKind.JS };

export function parse(path, text) {
  const kind = SCRIPT_KINDS[/\.[cm]?([jt]sx?)$/.exec(path)?.[1]] ?? ts.ScriptKind.TS;
  return ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, kind);
}

export function descendants(node) {
  const found = [];
  const visit = (child) => {
    found.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
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
export const moduleReferences = (path, text) =>
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
export function resolveRelative(tree, path, specifier) {
  const target = posix.join(posix.dirname(path), specifier);
  const [, stem, ext = ''] = /^(.*?)(\.[cm]?jsx?)?$/.exec(target);
  return [target, ...RESOLVED_FORMS[ext].map((form) => stem + form)].find((candidate) =>
    tree.has(candidate),
  );
}
