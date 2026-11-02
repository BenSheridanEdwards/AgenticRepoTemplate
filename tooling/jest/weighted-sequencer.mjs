import { createRequire } from 'node:module';
import { relative } from 'node:path';

const require = createRequire(import.meta.url);
const jestRequire = createRequire(require.resolve('jest/package.json'));
const configRequire = createRequire(jestRequire.resolve('jest-config/package.json'));
const { default: Sequencer } = configRequire('@jest/test-sequencer');

export const DEFAULT_WEIGHT = 5;
// Refresh WEIGHTS from CI per-file test timings.
export const WEIGHTS = {
  'tooling/trial/compare.test.ts': 38,
  'tooling/trial/run-trial.test.ts': 41,
  'scripts/block-gate-bypass.test.ts': 11,
  'tooling/architecture/structure.test.ts': 55,
  'scripts/check-suppressions.test.ts': 10,
  'scripts/anti-slop-lint.test.ts': 18,
  'tooling/trial/acceptance-api.test.ts': 25,
  'tooling/trial/inclusion.test.ts': 65,
  'scripts/blast-radius.test.ts': 7,
  'tooling/architecture/boundaries.test.ts': 14,
  'tooling/architecture/diagram.test.ts': 8,
  'tooling/architecture/typescript.test.ts': 11,
  'scripts/check-lockfile.test.ts': 8,
  'scripts/jest-console-guard.test.ts': 11,
};

export const weight = (test) =>
  WEIGHTS[relative(test.context.config.rootDir, test.path).split('\\').join('/')] ?? DEFAULT_WEIGHT;

export default class WeightedSequencer extends Sequencer {
  shard(tests, { shardIndex, shardCount }) {
    const shards = Array.from({ length: shardCount }, () => ({ tests: [], weight: 0 }));
    [...tests]
      .sort((a, b) => weight(b) - weight(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .forEach((test) => {
        const lightest = shards.reduce((best, shard) =>
          shard.weight < best.weight ? shard : best,
        );
        lightest.tests.push(test);
        lightest.weight += weight(test);
      });
    return shards[shardIndex - 1].tests;
  }
}
