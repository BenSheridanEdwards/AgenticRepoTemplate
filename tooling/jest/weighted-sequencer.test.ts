import Sequencer, { DEFAULT_WEIGHT, WEIGHTS, weight } from './weighted-sequencer.mjs';

const tests = [...Object.keys(WEIGHTS), 'unknown.test.ts'].map((path) => ({
  path: `/repo/${path}`,
  context: { config: { rootDir: '/repo' } },
}));

test.each([2, 3])('partitions deterministically across %i shards', (shardCount) => {
  const sequencer = new Sequencer();
  const partition = (input = tests) =>
    Array.from({ length: shardCount }, (_, index) =>
      sequencer.shard(input, { shardIndex: index + 1, shardCount }),
    );
  const shards = partition();
  expect(shards.flat()).toHaveLength(tests.length);
  expect(new Set(shards.flat())).toEqual(new Set(tests));
  expect(partition([...tests].reverse())).toEqual(shards);
  const heaviest = [...tests].sort((a, b) => weight(b) - weight(a)).slice(0, shardCount);
  expect(
    shards.every((shard) => shard.filter((test) => heaviest.includes(test)).length === 1),
  ).toBe(true);
  expect(weight(tests[tests.length - 1])).toBe(DEFAULT_WEIGHT);
});
