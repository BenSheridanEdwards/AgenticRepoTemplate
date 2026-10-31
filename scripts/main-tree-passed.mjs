#!/usr/bin/env node
/**
 * Decides whether a push to `main` needs a full CI run (ADR 0088). A squash
 * merge of a pull request that contained main has the PR head's exact tree,
 * and that PR's `Required gates` run already judged it. A different tree, a
 * direct push, missing data or any API error means CI runs.
 *
 * CLI: prints `passed=true|false` for `$GITHUB_OUTPUT`. Reads GH_TOKEN, REPO
 * and SHA from the environment.
 */

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const AGGREGATE_CHECK = 'Required gates';

/** True only when a merged PR into main has `mainTree` as its head tree and passed. */
export function treeAlreadyPassed({ mainTree, pulls }) {
  return pulls.some(
    (pull) =>
      pull.merged &&
      pull.baseRef === 'main' &&
      pull.headTree === mainTree &&
      pull.requiredGates === 'success',
  );
}

/** The conclusion of the most recently completed `Required gates` check run. */
export function latestConclusion(checkRuns) {
  const completed = checkRuns
    .filter((run) => run.name === AGGREGATE_CHECK && run.completed_at)
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  return completed[0]?.conclusion ?? 'missing';
}

async function describePull(api, pull) {
  const query = `check_name=${encodeURIComponent(AGGREGATE_CHECK)}&per_page=100`;
  const [head, checks] = await Promise.all([
    api(`git/commits/${pull.head.sha}`),
    api(`commits/${pull.head.sha}/check-runs?${query}`),
  ]);
  return {
    merged: Boolean(pull.merged_at),
    baseRef: pull.base.ref,
    headTree: head.tree.sha,
    requiredGates: latestConclusion(checks.check_runs),
  };
}

/** Reads the pushed commit and its pull requests through `api`; fails closed. */
export async function decide({ api, sha }) {
  try {
    const [commit, pulls] = await Promise.all([
      api(`git/commits/${sha}`),
      api(`commits/${sha}/pulls`),
    ]);
    const described = await Promise.all(pulls.map((pull) => describePull(api, pull)));
    return treeAlreadyPassed({ mainTree: commit.tree.sha, pulls: described });
  } catch (error) {
    console.error(`Running CI: could not prove the tree already passed (${error.message}).`);
    return false;
  }
}

async function runCli() {
  const { GH_TOKEN: token, REPO: repo, SHA: sha } = process.env;
  const api = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  };
  const passed = Boolean(token && repo && sha) && (await decide({ api, sha }));
  console.log(`passed=${passed}`);
}

// realpath and pathToFileURL keep the guard true for symlinked or spaced paths.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
