import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findNegativePhrasing, isGuidanceDoc } from './check-doc-phrasing.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('findNegativePhrasing', () => {
  it.each([
    ['Do not commit secrets.', 'Do not'],
    ["Don't hand-sort imports.", "Don't"],
    ['Agents never merge.', 'never'],
    ['A PR must not skip a gate.', 'must not'],
    ['Avoid placeholder PRs.', 'Avoid'],
    ['You cannot skip the gates.', 'cannot'],
    ['- **No abbreviations in identifiers.**', 'No'],
    ['No router, store, or backend.', 'No'],
  ])('reports %j', (line, phrase) => {
    expect(findNegativePhrasing(`# Title\n\n${line}\n`)).toEqual([{ line: 3, phrase }]);
  });

  it.each([
    'Keep secrets out of commits.',
    'Use `--no-verify` nowhere; the hook refuses it.',
    'The proof section says `Not applicable` with a reason.',
    '```sh\n# do not run this\n```',
    'Run `git commit --no-verify` and the hook refuses it, as `do not` in code shows.',
    'Notice the knock-on effect.',
  ])('passes %j', (text) => {
    expect(findNegativePhrasing(text)).toEqual([]);
  });

  it('closes a fence only on a matching marker', () => {
    const text = ['````md', '```', 'do not run this', '```', '````', 'Never skip a gate.'].join(
      '\n',
    );

    expect(findNegativePhrasing(text)).toEqual([{ line: 6, phrase: 'Never' }]);
  });
});

describe('isGuidanceDoc', () => {
  it.each([
    'AGENTS.md',
    'README.md',
    '.agents/project/CONVENTIONS.md',
    '.github/pull_request_template.md',
    'docs/proof/README.md',
    '.claude/skills/show-me/REPOSITORY.md',
  ])('checks %s', (path) => {
    expect(isGuidanceDoc(path)).toBe(true);
  });

  it.each([
    '.agents/decisions/0001-record-architecture-decisions.md',
    '.claude/skills/show-me/SKILL.md',
    'src/features/threshold-counter/ThresholdCounter.tsx',
  ])('leaves %s alone', (path) => {
    expect(isGuidanceDoc(path)).toBe(false);
  });
});

describe('check-doc-phrasing CLI', () => {
  it('passes on the repository docs', () => {
    const run = spawnSync('node', ['scripts/check-doc-phrasing.mjs'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });
});
