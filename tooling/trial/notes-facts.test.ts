/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compareResults } from './dimensions.mjs';
import { readContract, readResultFacts } from './result-facts.mjs';

const report = readFileSync(resolve(import.meta.dirname, 'fixtures/notes/api.api.md'), 'utf8');
const contract = readContract(
  readFileSync(resolve(import.meta.dirname, '../../.fallowrc.jsonc'), 'utf8'),
);
const facts = (text = report) =>
  readResultFacts({
    id: 'notes-01',
    root: 'showcase/notes-01',
    brief: 'notes',
    passed: true,
    verified: true,
    tree: new Map([['api/etc/api.api.md', text]]),
    contract,
  });
const aspect = (text: string, key: string) =>
  compareResults([facts(text)]).differences.find((difference) => difference.key === key);

it('recognizes the Notes operations and its exact item shape', () => {
  const result = facts();
  expect(result.procedures.map(({ operation }) => operation)).toEqual(['list', 'create', 'delete']);
  expect(result.procedures[1]?.input.normalized).toBe('{ body: string; title: string }');
  expect(aspect(report, 'public-api · operations')?.classification).toBe('identical');
  expect(aspect(report, 'public-api · item shape')?.classification).toBe('identical');
  expect(
    compareResults([result]).method.find(({ id }) => id === 'public-api')?.mustBeIdentical,
  ).toContain('body: string');
});

it('rejects a Notes tree with an extra toggle mutation', () => {
  const extra = report.replace(
    '    delete:',
    '    toggle: TRPCMutationProcedure<{ input: { id: string }; output: { id: string; title: string; body: string } }>;\n    delete:',
  );
  expect(aspect(extra, 'public-api · operations')?.classification).toBe('outside-spec');
});

it.each([
  ['a missing body', report.replaceAll('; body: string', '')],
  ['a non-string body', report.replaceAll('body: string', 'body: number')],
  [
    'an extra completed field',
    report.replaceAll('body: string', 'body: string; completed: boolean'),
  ],
])('rejects an item with %s', (_name, changed) => {
  expect(aspect(changed, 'public-api · item shape')?.classification).toBe('outside-spec');
});
