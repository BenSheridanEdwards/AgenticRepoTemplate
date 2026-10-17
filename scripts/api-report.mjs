#!/usr/bin/env node
/**
 * Keep one committed API Extractor report per public module entry.
 *
 * The entries come from the zones in `.fallowrc.jsonc`: every zone except the
 * `app` composition root is a module tree `<dir>/**` whose public surface is
 * `<dir>/index.ts`. A zone without its own `index.ts` (such as `apps/web/src/shared/**`)
 * holds one public module per sub-folder, `<dir>/<module>/index.ts`.
 *
 * Each report lives in `<package>/etc/<entry>.api.md`, where `<package>` is the
 * nearest folder above the entry with a `package.json` (`apps/web/etc/` today).
 * `node scripts/api-report.mjs --local` (`pnpm api:report`) rewrites the
 * reports. Without `--local` (`pnpm api:check`) it compares and exits 1 when any
 * committed report differs from the code.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { readFallowBoundaries } from './fallow-roles.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIRECTORY = join(REPOSITORY_ROOT, '.cache/api');
const DECLARATIONS_DIRECTORY = join(CACHE_DIRECTORY, 'dts');

/** The nearest folder above `entry` that holds a `package.json`, repository-relative. */
function packageRootOf(entry) {
  let directory = dirname(entry);
  while (directory !== '.' && !existsSync(join(REPOSITORY_ROOT, directory, 'package.json'))) {
    directory = dirname(directory);
  }
  return directory;
}

/** The public entries under one zone pattern `<dir>/**`: `<dir>/index.ts`, else `<dir>/<module>/index.ts`. */
function entriesOfPattern(zoneName, pattern) {
  const directory = pattern.replace(/\/\*\*$/, '');
  const hasOwnIndex = existsSync(join(REPOSITORY_ROOT, directory, 'index.ts'));
  const modules = hasOwnIndex ? [''] : readdirSync(join(REPOSITORY_ROOT, directory)).sort();
  return modules
    .filter((module) => existsSync(join(REPOSITORY_ROOT, directory, module, 'index.ts')))
    .map((module) => ({
      name: [zoneName, module].filter(Boolean).join('/'),
      entry: [directory, module, 'index.ts'].filter(Boolean).join('/'),
    }));
}

/**
 * List `{ name, entry }` once for every public module outside the app zone. A
 * group zone and its discovered child zone find the same entry file, so keep one.
 */
function listPublicEntries(boundariesJson) {
  const { boundaries } = JSON.parse(boundariesJson);
  const entries = boundaries.zones
    .filter((zone) => zone.name !== 'app')
    .flatMap((zone) => zone.patterns.flatMap((pattern) => entriesOfPattern(zone.name, pattern)));
  return [...new Map(entries.map((entry) => [entry.entry, entry])).values()];
}

function emitDeclarations() {
  rmSync(DECLARATIONS_DIRECTORY, { recursive: true, force: true });
  execFileSync(
    join(REPOSITORY_ROOT, 'node_modules/.bin/tsc'),
    [
      ...['-p', 'tsconfig.json', '--noEmit', 'false', '--declaration', '--emitDeclarationOnly'],
      ...['--outDir', DECLARATIONS_DIRECTORY],
    ],
    { cwd: REPOSITORY_ROOT, stdio: 'inherit' },
  );
}

function runExtractor({ name, entry }, localBuild) {
  const reportName = name.replaceAll('/', '-');
  const reportDirectory = join(packageRootOf(entry), 'etc');
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
    packageJsonFullPath: join(REPOSITORY_ROOT, packageRootOf(entry), 'package.json'),
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

const localBuild = process.argv.includes('--local');
const entries = listPublicEntries(readFallowBoundaries());
if (entries.length === 0) {
  console.error('api: .fallowrc.jsonc lists no public module entries.');
  process.exit(1);
}
emitDeclarations();
const failed = entries.filter((entry) => !runExtractor(entry, localBuild));
process.exit(failed.length === 0 ? 0 : 1);
