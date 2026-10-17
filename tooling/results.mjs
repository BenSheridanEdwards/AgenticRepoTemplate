/**
 * The one place that discovers results. A result is a pair of workspace
 * packages, `<root>/web` and `<root>/api`: the reference in `apps/`, and each
 * independently generated result in `showcase/<id>/`. Gates that run per result
 * (Playwright today) read this list, so a new result needs no config entry.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REFERENCE_PORTS = { web: 5173, api: 3001 };
const PORT_STEP = 10;

const isResultRoot = (repositoryRoot, root) =>
  existsSync(join(repositoryRoot, root, 'web/package.json')) &&
  existsSync(join(repositoryRoot, root, 'api/package.json'));

/**
 * The reference first, then every `showcase/<id>` with both `web/package.json`
 * and `api/package.json`, sorted by id. Ports step by 10 per result.
 *
 * @param {string} repositoryRoot
 * @returns {readonly import('./results.d.mts').Result[]}
 */
export function listResults(repositoryRoot) {
  const showcase = join(repositoryRoot, 'showcase');
  const ids = existsSync(showcase)
    ? readdirSync(showcase, { withFileTypes: true })
        .filter(
          (entry) => entry.isDirectory() && isResultRoot(repositoryRoot, `showcase/${entry.name}`),
        )
        .map((entry) => entry.name)
        .sort()
    : [];
  const roots = [
    { id: 'reference', root: 'apps', scope: 'repo' },
    ...ids.map((id) => ({ id, root: `showcase/${id}`, scope: id })),
  ];
  return roots.map(({ id, root, scope }, index) => ({
    id,
    root,
    scope,
    web: `${root}/web`,
    api: `${root}/api`,
    ports: {
      web: REFERENCE_PORTS.web + index * PORT_STEP,
      api: REFERENCE_PORTS.api + index * PORT_STEP,
    },
  }));
}
