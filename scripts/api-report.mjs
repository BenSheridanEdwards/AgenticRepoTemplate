#!/usr/bin/env node
/**
 * Keep one committed API Extractor report per public module entry.
 *
 * The entries come from the workspace packages (`apps/*`, `packages/*`,
 * `showcase/<id>/*`). A package's own entry, the `types` or default condition of
 * `exports["."]` in its `package.json`, gives `<package>/etc/<unscoped name>.api.md`
 * (`apps/api/etc/api.api.md` for `@repo/api`). Inside a package, each
 * `src/routes/<name>/index.ts` and `src/features/<name>/index.ts` gives
 * `<package>/etc/<folder>-<name>.api.md`, and `src/api-client/index.ts` gives
 * `<package>/etc/api-client.api.md`.
 *
 * `node scripts/api-report.mjs --local` (`pnpm api:report`) rewrites the
 * reports. Without `--local` (`pnpm api:check`) it compares and exits 1 when any
 * committed report differs from the code.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIRECTORY = join(REPOSITORY_ROOT, '.cache/api');
const DECLARATIONS_DIRECTORY = join(CACHE_DIRECTORY, 'dts');

const PACKAGE_MANIFEST = /^(apps\/[^/]+|packages\/[^/]+|showcase\/[^/]+\/[^/]+)\/package\.json$/;
const MODULE_ENTRY = /^src\/(?:(routes|features)\/([^/]+)|(api-client))\/index\.ts$/;

/** The file `exports["."]` names for types, or by default. */
function packageEntry(exports) {
  const root =
    typeof exports === 'object' && exports !== null ? (exports['.'] ?? exports) : exports;
  const entry = typeof root === 'string' ? root : (root?.types ?? root?.default);
  return typeof entry === 'string' ? posix.normalize(entry) : undefined;
}

/**
 * List `{ name, entry, packageRoot }` for every public entry among `files`. Pure.
 *
 * @param {string[]} files repository-relative paths: package manifests and sources
 * @param {(path: string) => { name: string, exports?: unknown }} readManifest
 */
export function listPublicEntries(files, readManifest) {
  const packageRoots = files
    .filter((file) => PACKAGE_MANIFEST.test(file))
    .map((file) => posix.dirname(file))
    .sort();
  return packageRoots.flatMap((packageRoot) => {
    const manifest = readManifest(`${packageRoot}/package.json`);
    const ownEntry = packageEntry(manifest.exports);
    const modules = files
      .filter((file) => file.startsWith(`${packageRoot}/`))
      .map((file) => ({ file, match: MODULE_ENTRY.exec(file.slice(packageRoot.length + 1)) }))
      .filter(({ match }) => match)
      .map(({ file, match: [, folder, module, apiClient] }) => ({
        name: apiClient ?? `${folder}-${module}`,
        entry: file,
        packageRoot,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const own = ownEntry
      ? [
          {
            name: manifest.name.replace(/^@[^/]+\//, ''),
            entry: posix.join(packageRoot, ownEntry),
            packageRoot,
          },
        ]
      : [];
    return [...own, ...modules];
  });
}

/** Package manifests and candidate module entries on disk, repository-relative. */
function workspaceFiles() {
  const directories = (path) =>
    existsSync(join(REPOSITORY_ROOT, path))
      ? readdirSync(join(REPOSITORY_ROOT, path), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${path}/${entry.name}`)
      : [];
  const packageRoots = [
    ...directories('apps'),
    ...directories('packages'),
    ...directories('showcase').flatMap(directories),
  ].filter((root) => existsSync(join(REPOSITORY_ROOT, root, 'package.json')));
  return packageRoots
    .flatMap((root) => [
      `${root}/package.json`,
      `${root}/src/api-client/index.ts`,
      ...['routes', 'features'].flatMap((folder) =>
        directories(`${root}/src/${folder}`).map((module) => `${module}/index.ts`),
      ),
    ])
    .filter((file) => existsSync(join(REPOSITORY_ROOT, file)));
}

function emitDeclarations() {
  rmSync(DECLARATIONS_DIRECTORY, { recursive: true, force: true });
  for (const program of ['tsconfig.json', 'tsconfig.api.json']) {
    execFileSync(
      join(REPOSITORY_ROOT, 'node_modules/.bin/tsc'),
      [
        ...['-p', program, '--noEmit', 'false', '--declaration', '--emitDeclarationOnly'],
        ...['--rootDir', REPOSITORY_ROOT, '--outDir', DECLARATIONS_DIRECTORY],
      ],
      { cwd: REPOSITORY_ROOT, stdio: 'inherit' },
    );
  }
}

function runExtractor({ name: reportName, entry, packageRoot }, localBuild) {
  const reportDirectory = join(packageRoot, 'etc');
  mkdirSync(join(REPOSITORY_ROOT, reportDirectory), { recursive: true });
  const configObject = {
    projectFolder: REPOSITORY_ROOT,
    mainEntryPointFilePath: join(DECLARATIONS_DIRECTORY, entry.replace(/\.ts$/, '.d.ts')),
    compiler: {
      overrideTsconfig: {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          // The api's declarations keep their explicit `.ts` import extensions.
          allowImportingTsExtensions: true,
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          types: [],
        },
        include: [DECLARATIONS_DIRECTORY],
      },
    },
    apiReport: {
      enabled: true,
      reportFileName: reportName,
      reportFolder: join(REPOSITORY_ROOT, reportDirectory),
      reportTempFolder: join(CACHE_DIRECTORY, 'temp'),
    },
    docModel: { enabled: false },
    dtsRollup: { enabled: false },
    tsdocMetadata: { enabled: false },
    messages: {
      extractorMessageReporting: {
        // The repo has no release stages, so the @public/@beta tags carry no meaning.
        'ae-missing-release-tag': { logLevel: 'none' },
      },
    },
  };
  const config = ExtractorConfig.prepare({
    configObject,
    configObjectFullPath: undefined,
    packageJsonFullPath: join(REPOSITORY_ROOT, packageRoot, 'package.json'),
    packageJson: { name: reportName, version: '0.0.0' },
  });
  const result = Extractor.invoke(config, { localBuild });
  if (result.apiReportChanged && !localBuild) {
    console.error(
      `api: ${entry} differs from ${reportDirectory}/${reportName}.api.md. Run \`pnpm api:report\` and commit the report.`,
    );
  }
  return result.succeeded;
}

function runCli() {
  const localBuild = process.argv.includes('--local');
  const entries = listPublicEntries(workspaceFiles(), (path) =>
    JSON.parse(readFileSync(join(REPOSITORY_ROOT, path), 'utf8')),
  );
  if (entries.length === 0) {
    console.error('api: the workspace packages list no public module entries.');
    process.exit(1);
  }
  emitDeclarations();
  const failed = entries.filter((entry) => !runExtractor(entry, localBuild));
  process.exit(failed.length === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
