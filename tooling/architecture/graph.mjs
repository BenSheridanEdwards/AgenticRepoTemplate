/**
 * Fallow owns the import graph (ADR 0014). This module reads it, and is the one
 * place the architecture CLIs run Fallow and git: `readRepository` gives the
 * contract, the file edges, the files and the results of a repository.
 */

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listResults } from '../results.mjs';
import { loadContract } from './contract.mjs';

/** @typedef {{ readonly from: string, readonly to: string }} FileEdge */

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FALLOW = join(TOOL_ROOT, 'node_modules/.bin/fallow');

/**
 * The file-to-file edges of `fallow viz --viz-format dot` output. An empty
 * parse means Fallow's dot format changed; failing here keeps a silently empty
 * diagram or graph out of every check.
 *
 * @param {string} dotText
 * @returns {readonly FileEdge[]}
 */
export function parseDotGraph(dotText) {
  const labels = new Map(
    [...dotText.matchAll(/^\s*(n\d+) \[label="([^"]+)"/gm)].map(([, id, label]) => [id, label]),
  );
  if (labels.size === 0) {
    throw new Error('graph: the dot graph has no labelled nodes; check the Fallow output format.');
  }
  const edges = [...dotText.matchAll(/^\s*(n\d+) -> (n\d+);/gm)].map(([, from, to]) => ({
    from: labels.get(from) ?? '',
    to: labels.get(to) ?? '',
  }));
  if (edges.length === 0) {
    throw new Error('graph: the dot graph has no edges; check the Fallow output format.');
  }
  return edges;
}

/** The value of `--root <dir>` in `argv`, else this repository. */
function rootFromArgs(argv) {
  const index = argv.indexOf('--root');
  if (index === -1) {
    return TOOL_ROOT;
  }
  const root = argv[index + 1];
  if (!root || root.startsWith('--')) {
    throw new Error('architecture: --root needs a folder.');
  }
  return resolve(root);
}

const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/**
 * Tracked and untracked, not ignored, paths in the working tree: the regular
 * files, and the symlinks, which the structure check fails inside a result.
 * A tracked file deleted from the tree is neither.
 */
function listPaths(root) {
  const output = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root);
  const paths = [...new Set(output.split('\0').filter(Boolean))].sort();
  const kinds = paths.map((path) => lstatSync(join(root, path), { throwIfNoEntry: false }));
  return {
    files: paths.filter((_, index) => kinds[index]?.isFile()),
    symlinks: paths.filter((_, index) => kinds[index]?.isSymbolicLink()),
  };
}

/**
 * Everything the structure validator and the diagram generator read.
 *
 * @param {string} root the repository root
 */
export function readRepository(root) {
  const dotPath = join(root, '.cache/arch/graph.dot');
  mkdirSync(dirname(dotPath), { recursive: true });
  run(FALLOW, ['viz', '--no-open', '--viz-format', 'dot', '--out', dotPath, '-q'], root);
  return {
    contract: loadContract(run(FALLOW, ['config', '--format', 'json', '-q'], root)),
    edges: parseDotGraph(readFileSync(dotPath, 'utf8')),
    ...listPaths(root),
    results: listResults(root),
  };
}

/** Runs `main` and turns a thrown error into a message and exit code 1. */
export function runCli(main) {
  try {
    process.exitCode = main(rootFromArgs(process.argv)) ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
