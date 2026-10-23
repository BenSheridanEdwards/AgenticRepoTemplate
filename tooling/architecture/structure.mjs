#!/usr/bin/env node
/**
 * Validate the structure of every result against the contract: the reference
 * in `apps/` and each `showcase/<id>/` alike, with no per-result entry.
 *
 * `validateStructure` is pure. `RULES` holds one entry per rule: how to find
 * its violations and how to describe one. The CLI (`node
 * tooling/architecture/structure.mjs`, part of `pnpm arch:gate`) reads the
 * repository through Fallow and git, prints `OK` with the number of results,
 * or prints each violation and exits 1. `--root <dir>` targets another
 * repository.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRepository, runCli } from './graph.mjs';
import { moduleReferences, resolveRelative } from './imports.mjs';

/** What a result root and each package may hold. Anything else is an unexpected file. */
const LAYOUT = {
  root: { label: 'a result root', files: ['architecture.mmd'], folders: ['web', 'api'] },
  web: {
    label: 'a web package',
    files: ['package.json', 'index.html', 'vite.config.ts'],
    folders: ['src', 'public', 'e2e', 'etc'],
  },
  api: { label: 'an api package', files: ['package.json'], folders: ['src', 'etc'] },
};

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/**
 * A directive that silences or reconfigures a check: lint and type
 * suppressions, ESLint inline config and globals, and coverage pragmas.
 */
const SUPPRESSION =
  /(?:eslint-disable|@ts-(?:expect-error|ignore|nocheck)|biome-ignore|fallow-ignore|\/\*\s*eslint(?:-env)?\s|\/\*\s*globals?\s|(?:istanbul|c8|v8)\s+ignore)/;

/** Tool config a result could use to loosen a root gate; allowed only where `LAYOUT` names it. */
const CONFIG_FILE =
  /^(?:package\.json|[jt]sconfig.*\.json|biome\.jsonc?|eslint\.config\.[cm]?[jt]s|\.eslintrc.*|\.eslintignore|\.npmrc|\.nvmrc|\.gitignore|\.babelrc.*|\.swcrc|\.prettierrc.*|\.fallowrc.*|fallow\.toml|\.size-limit.*|lighthouserc.*|\.browserslistrc|(?:vite|vitest|jest|playwright|babel|postcss|tailwind|webpack|rollup|prettier|commitlint)\.config\.[cm]?[jt]s)$/;

/** A file that can hold a role: source and style, not a test, a declaration or a note. */
const isRoleSource = (file) =>
  /\.(?:tsx?|css)$/.test(file) && !/\.(?:test\.tsx?|d\.ts)$/.test(file);

const PACKAGE_KINDS = ['web', 'api'];

const sameList = (left, right) => left.join('\n') === right.join('\n');

/** JSON text with object keys sorted, so two values compare by content. */
const canonical = (value) =>
  JSON.stringify(value, (_, inner) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([left], [right]) => (left < right ? -1 : 1)))
      : inner,
  );

const resultOf = (results, file) => results.find((result) => file.startsWith(`${result.root}/`));

/** True when `path` (relative to a root or package) fits `layout`. */
function fits(layout, path) {
  const [first, ...rest] = path.split('/');
  return rest.length === 0 ? layout.files.includes(first) : layout.folders.includes(first);
}

function isAllowed(result, file) {
  const path = file.slice(result.root.length + 1);
  const [first, ...rest] = path.split('/');
  if (!fits(LAYOUT.root, path)) {
    return false;
  }
  if (rest.length > 1 && CONFIG_FILE.test(rest.at(-1))) {
    return false;
  }
  return rest.length === 0 || fits(LAYOUT[first], rest.join('/'));
}

function missingRoles({ contract, results, files }) {
  return results.flatMap((result) =>
    PACKAGE_KINDS.flatMap((kind) => {
      const held = new Set(
        files
          .filter((file) => file.startsWith(`${result[kind]}/`) && isRoleSource(file))
          .map(contract.roleOf),
      );
      return contract.requiredRoles[kind]
        .filter((role) => !held.has(role))
        .map((role) => ({ kind: 'missing-role', result: result.root, role }));
    }),
  );
}

function unexpectedFiles({ results, files }) {
  return files.flatMap((file) => {
    const result = resultOf(results, file);
    return result && !isAllowed(result, file)
      ? [{ kind: 'unexpected-file', result: result.root, path: file }]
      : [];
  });
}

function symlinks({ results, symlinks: paths }) {
  return paths.flatMap((path) => {
    const result = resultOf(results, path);
    return result ? [{ kind: 'symlink', result: result.root, path }] : [];
  });
}

function dependencyProblems(manifest, reference, referenceDirectory) {
  const workspace = [];
  const problems = [];
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (range.startsWith('workspace:')) {
        workspace.push(name);
      } else if (reference[field]?.[name] !== range) {
        problems.push(
          `${field} "${name}": "${range}" is not in ${referenceDirectory}/package.json; use only its dependencies and ranges`,
        );
      }
    }
  }
  return { workspace: workspace.sort(), problems };
}

/**
 * Every field other than the name and the dependencies matches the reference
 * package of the same kind, with the reference's scope read as this result's.
 */
function fieldProblems(manifest, reference, referenceDirectory, rename) {
  const fields = [...new Set([...Object.keys(reference), ...Object.keys(manifest)])].filter(
    (field) => field !== 'name' && !DEPENDENCY_FIELDS.includes(field),
  );
  return fields
    .map((field) => [field, canonical(manifest[field]), rename(canonical(reference[field]))])
    .filter(([, actual, expected]) => actual !== expected)
    .map(
      ([field, actual, expected]) =>
        `"${field}" is ${actual ?? 'missing'}; ${referenceDirectory}/package.json has ${expected ?? 'none'}`,
    );
}

function manifestProblems(
  manifest,
  reference,
  { referenceDirectory, referenceScope, scope, kind },
) {
  const name = `@${scope}/${kind}`;
  const rename = (text) => text?.replaceAll(`@${referenceScope}/`, `@${scope}/`);
  const expectedWorkspace = kind === 'web' ? [`@${scope}/api`, '@repo/ui'].sort() : [];
  const { workspace, problems } = dependencyProblems(manifest, reference, referenceDirectory);
  return [
    manifest.name !== name && `name is "${manifest.name}"; name it "${name}"`,
    ...fieldProblems(manifest, reference, referenceDirectory, rename),
    ...problems,
    !sameList(workspace, expectedWorkspace) &&
      `workspace dependencies are [${workspace}]; list exactly [${expectedWorkspace}]`,
  ].filter(Boolean);
}

function manifests({ results, manifests: byDirectory }) {
  const [reference] = results;
  return results.flatMap((result) =>
    PACKAGE_KINDS.flatMap((kind) => {
      const directory = result[kind];
      const manifest = byDirectory.get(directory);
      const problems = manifest
        ? manifestProblems(manifest, byDirectory.get(reference[kind]) ?? {}, {
            referenceDirectory: reference[kind],
            referenceScope: reference.scope,
            scope: result.scope,
            kind,
          })
        : ['is missing'];
      return problems.map((problem) => ({ kind: 'manifest', package: directory, problem }));
    }),
  );
}

function incompleteResults({ results, files }) {
  const roots = new Set(
    files
      .filter((file) => file.startsWith('showcase/') && file.split('/').length > 2)
      .map((file) => file.split('/').slice(0, 2).join('/'))
      .filter((root) => !results.some((result) => result.root === root)),
  );
  return [...roots].flatMap((root) =>
    PACKAGE_KINDS.map((kind) => `${root}/${kind}/package.json`)
      .filter((manifest) => !files.includes(manifest))
      .map((missing) => ({ kind: 'incomplete-result', root, missing })),
  );
}

const isE2eSpec = (result, file) =>
  file.startsWith(`${result.web}/e2e/`) && file.endsWith('.spec.ts');

function missingE2e({ results, files }) {
  return results
    .filter((result) => !files.some((file) => isE2eSpec(result, file)))
    .map((result) => ({ kind: 'missing-e2e', package: result.web }));
}

function crossResultImports({ results, edges }) {
  return edges
    .filter((edge) => {
      const from = resultOf(results, edge.from);
      const to = resultOf(results, edge.to);
      return from && to && from !== to;
    })
    .map(({ from, to }) => ({ kind: 'cross-result-import', from, to }));
}

const featureDirectory = (file) => /^(.*?\/api\/src\/features\/[^/]+)\//.exec(file)?.[1];

function importsDomainValue(application, domains, { files, edges, readText }) {
  const targets = new Set(
    edges
      .filter(({ from, to }) => from === application && domains.includes(to))
      .map(({ to }) => to),
  );
  return moduleReferences(application, readText(application)).some(
    ({ specifier, typeOnly }) =>
      !typeOnly &&
      specifier.startsWith('.') &&
      targets.has(resolveRelative(files, application, specifier)),
  );
}

function applicationsWithoutDomainRule({ contract, results, files, edges, readText }) {
  const sources = files.filter((file) => isRoleSource(file) && resultOf(results, file));
  const applications = sources.filter((file) => contract.roleOf(file) === 'api-application');
  const domains = sources.filter((file) => contract.roleOf(file) === 'api-domain');
  return [...new Set(applications.map(featureDirectory).filter(Boolean))].flatMap((feature) => {
    const ownDomain = domains.filter((file) => featureDirectory(file) === feature);
    const ownApplication = applications.filter((file) => featureDirectory(file) === feature);
    const input = { files: new Set(files), edges, readText };
    return ownDomain.length > 0 &&
      !ownApplication.some((file) => importsDomainValue(file, ownDomain, input))
      ? [{ kind: 'application-without-domain-rule', feature }]
      : [];
  });
}

const SCAFFOLD_REPORTS = [
  { package: 'web', report: 'api-client', role: 'web-api-client' },
  { package: 'api', report: 'api', role: 'api-app' },
];

function reportExports(text) {
  const exports = [];
  const unsupported = [];
  for (const [line] of text.matchAll(/^export .*$/gm)) {
    const declaration =
      /^export (?:declare )?(function|const|type|interface|class|enum) (\w+)/.exec(line);
    if (declaration) {
      const [, kind, name] = declaration;
      exports.push(`${name}:${kind === 'type' || kind === 'interface' ? 'type' : 'value'}`);
    } else {
      unsupported.push(line.trim());
    }
  }
  return { exports: exports.sort(), unsupported };
}

function scaffoldExports({ results, files, readText }) {
  const [reference] = results;
  return results.flatMap((result) =>
    SCAFFOLD_REPORTS.flatMap(({ package: kind, report, role }) => {
      const path = `${result[kind]}/etc/${report}.api.md`;
      if (!files.includes(path)) {
        // pnpm api:check enforces report existence and freshness against source.
        return [];
      }
      const referencePath = `${reference[kind]}/etc/${report}.api.md`;
      const actual = reportExports(readText(path));
      const expected = reportExports(readText(referencePath));
      if (actual.unsupported.length > 0 || expected.unsupported.length > 0) {
        return actual.unsupported.map((line) => ({
          kind: 'scaffold-exports',
          path,
          problem: `Unsupported scaffold API export: ${line}`,
        }));
      }
      return sameList(actual.exports, expected.exports)
        ? []
        : [
            {
              kind: 'scaffold-exports',
              path,
              referencePath,
              role,
              actual: actual.exports,
              expected: expected.exports,
            },
          ];
    }),
  );
}

function suppressions({ results, files, readText }) {
  return files
    .filter((file) => resultOf(results, file))
    .flatMap((path) =>
      readText(path)
        .split('\n')
        .flatMap((text, index) =>
          SUPPRESSION.test(text) ? [{ kind: 'suppression', path, line: index + 1 }] : [],
        ),
    );
}

const ROLE_TABLE = 'see .agents/project/ARCHITECTURE.md';

const LAYOUT_TEXT = Object.values(LAYOUT)
  .map(
    ({ label, files, folders }) =>
      `${label} holds ${[...files, ...folders.map((folder) => `${folder}/`)].join(', ')}`,
  )
  .join('; ');

/** One entry per rule: `find` gives its violations, `describe` one line naming the fix. */
const RULES = {
  'missing-role': {
    find: missingRoles,
    describe: (violation) =>
      `missing-role ${violation.result}: no file holds the ${violation.role} role; add it (${ROLE_TABLE}).`,
  },
  'unexpected-file': {
    find: unexpectedFiles,
    describe: (violation) =>
      `unexpected-file ${violation.path}: ${LAYOUT_TEXT}; a tool config lives only at the repository root. Move or delete it.`,
  },
  symlink: {
    find: symlinks,
    describe: (violation) =>
      `symlink ${violation.path}: a result holds regular files only, so every gate reads them; copy the file or import the package.`,
  },
  manifest: {
    find: manifests,
    describe: (violation) => `manifest ${violation.package}/package.json: ${violation.problem}.`,
  },
  'incomplete-result': {
    find: incompleteResults,
    describe: (violation) =>
      `incomplete-result ${violation.root}: ${violation.missing} is missing; a result is a web and an api package.`,
  },
  'missing-e2e': {
    find: missingE2e,
    describe: (violation) =>
      `missing-e2e ${violation.package}: add at least one e2e/**/*.spec.ts, the result's behaviour map.`,
  },
  'cross-result-import': {
    find: crossResultImports,
    describe: (violation) =>
      `cross-result-import ${violation.from} -> ${violation.to}: a result imports only its own packages and packages/ui.`,
  },
  'application-without-domain-rule': {
    find: applicationsWithoutDomainRule,
    describe: (violation) =>
      `application-without-domain-rule ${violation.feature}: application imports nothing from domain by value; put the feature's rules (such as creating or toggling an item) in domain.ts and call them from application (${ROLE_TABLE}).`,
  },
  'scaffold-exports': {
    find: scaffoldExports,
    describe: (violation) =>
      violation.problem
        ? `scaffold-exports ${violation.path}: ${violation.problem}; use the reference's supported export declarations.`
        : `scaffold-exports ${violation.path}: exports [${violation.actual.join(', ')}]; the reference ${violation.referencePath} exports [${violation.expected.join(', ')}]. The ${violation.role} role is scaffold code; keep its public surface as the reference has it.`,
  },
  suppression: {
    find: suppressions,
    describe: (violation) =>
      `suppression ${violation.path}:${violation.line}: a result holds no suppression directive; fix the finding instead.`,
  },
};

/**
 * Every violation of the structure rules, in rule order. Pure.
 *
 * @param {{
 *   contract: import('./contract.mjs').Contract,
 *   results: readonly import('../results.d.mts').Result[],
 *   files: readonly string[],
 *   edges: readonly import('./graph.mjs').FileEdge[],
 *   symlinks: readonly string[],
 *   manifests: ReadonlyMap<string, Record<string, any>>,
 *   readText: (path: string) => string,
 * }} input
 */
export function validateStructure(input) {
  const sorted = { ...input, files: [...input.files].sort() };
  return Object.values(RULES).flatMap((rule) => rule.find(sorted));
}

function main(root) {
  const repository = readRepository(root);
  const manifestPaths = repository.results
    .flatMap((result) => PACKAGE_KINDS.map((kind) => result[kind]))
    .filter((directory) => existsSync(join(root, directory, 'package.json')));
  const violations = validateStructure({
    ...repository,
    manifests: new Map(
      manifestPaths.map((directory) => [
        directory,
        JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8')),
      ]),
    ),
    readText: (path) => readFileSync(join(root, path), 'utf8'),
  });
  if (violations.length > 0) {
    console.error(
      violations.map((violation) => RULES[violation.kind].describe(violation)).join('\n'),
    );
    return false;
  }
  const { results } = repository;
  const count = `${results.length} result${results.length === 1 ? '' : 's'}`;
  console.log(
    `OK: ${count} checked against the structure contract (${results.map((result) => result.id).join(', ')}).`,
  );
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(main);
}
