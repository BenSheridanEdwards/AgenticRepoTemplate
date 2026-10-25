/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  CONFIDENCE_LABEL_DEFS,
  CONFIDENCE_LABELS,
  collectSlices,
  coverageGaps,
  decideConfidence,
  isCoveredSource,
  lineCoverage,
  lineCoverageGaps,
  parseCoverage,
  prdGaps,
  renderSummary,
  requiredCheckNames,
  requiredCheckResults,
  sliceOf,
} from './confidence-label.mjs';
import { AGGREGATE, REQUIRED_GATES } from './required-gates.mjs';

const greetingSpec = {
  path: 'apps/web/e2e/greeting.spec.ts',
  text: "test('greets a name through the api', async () => {});",
};
const greetingPrd = {
  path: 'docs/prd/greeting.md',
  text: '# Greeting\n\n[Greeting](../../apps/web/e2e/greeting.spec.ts)',
};

const coveredSource = 'apps/web/src/routes/fixture-covered/Page.tsx';
const coverageEntry = (path = coveredSource, counts = [1, 1, 1, 1, 0]) => ({
  path: `/home/runner/work/R/R/${path}`,
  statementMap: Object.fromEntries(counts.map((_, id) => [id, { start: { line: id + 1 } }])),
  s: Object.fromEntries(counts.map((count, id) => [id, count])),
});
const coverageMap = (...entries: ReturnType<typeof coverageEntry>[]) =>
  Object.fromEntries(entries.map((entry) => [entry.path, entry]));

describe('changed source line coverage', () => {
  it('uses Jest coverage selection across results and excludes non-source files', () => {
    expect(
      [
        'apps/web/src/routes/greeting/useGreeting.ts',
        'packages/ui/src/Button.tsx',
        'showcase/todo-01/api/src/router.ts',
      ].every(isCoveredSource),
    ).toBe(true);
    expect(
      [
        'apps/web/src/routes/greeting/useGreeting.test.ts',
        'apps/web/e2e/greeting.spec.ts',
        'apps/web/vite.config.ts',
        'jest.config.ts',
        'docs/prd/greeting.md',
        'README.md',
        'apps/web/src/main.tsx',
        'apps/web/src/App.tsx',
        'apps/api/src/server.ts',
        'apps/api/src/features/greeting/index.ts',
        'packages/ui/src/types.d.ts',
        'scripts/x.mjs',
      ].some(isCoveredSource),
    ).toBe(false);
  });

  it.each([
    '',
    'not json',
    '[]',
    'null',
    '{}',
    JSON.stringify({ x: { path: 'x', s: {} } }),
    ...[-1, '3'].map((count) =>
      JSON.stringify({ x: { ...coverageEntry(coveredSource, [1]), s: { 0: count } } }),
    ),
    JSON.stringify({ x: { ...coverageEntry(), statementMap: { 0: { start: { line: 0 } } } } }),
  ])('rejects malformed coverage: %s', (text) => {
    expect(parseCoverage(text)).toBeUndefined();
  });

  it('accepts a valid two-file artifact', () => {
    const coverage = coverageMap(coverageEntry(), coverageEntry('packages/ui/src/Button.tsx'));
    expect(parseCoverage(JSON.stringify(coverage))).toEqual(coverage);
  });

  it('counts covered lines, combines same-line statements, and floors percentages', () => {
    expect(lineCoverage(coverageEntry())).toBe(80);
    expect(lineCoverage(coverageEntry(coveredSource, [1, 1, 1, 0]))).toBe(75);
    expect(lineCoverage(coverageEntry(coveredSource, [1, 1, 0]))).toBe(66.66);
    expect(lineCoverage(coverageEntry(coveredSource, []))).toBe(100);
    expect(
      lineCoverage({
        ...coverageEntry(coveredSource, [0, 2]),
        statementMap: { 0: { start: { line: 1 } }, 1: { start: { line: 1 } } },
      }),
    ).toBe(100);
  });

  it('reports low and absent files in changed order without crossing results', () => {
    const missing = 'showcase/todo-01/web/src/routes/fixture-covered/Page.tsx';
    const coverage = coverageMap(coverageEntry(coveredSource, [1, 1, 1, 0]));
    expect(lineCoverageGaps([coveredSource], coverageMap(coverageEntry()))).toEqual([]);
    const gaps = lineCoverageGaps([missing, coveredSource], coverage);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toContain(`\`${missing}\` has no entry`);
    expect(gaps[1]).toContain(`\`${coveredSource}\` has 75%`);
    expect(lineCoverageGaps([coveredSource], coverageMap(coverageEntry(missing)))[0]).toContain(
      `\`${coveredSource}\` has no entry`,
    );
  });
});

describe('confidence workflow', () => {
  it('uploads CI coverage on every result and consumes it only as data', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
      .split('  test:')[1]
      ?.split('  build:')[0];
    expect(ci).toMatch(
      /upload-artifact@v7\n\s+if: always\(\)(?:(?!- uses:)[\s\S])*name: coverage-final\n\s+path: coverage\/coverage-final.json/,
    );
    const workflow = readFileSync('.github/workflows/confidence.yml', 'utf8');
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('            jest.config.ts');
    expect(workflow).toMatch(/--name coverage-final --dir "\$\{RUNNER_TEMP\}\/coverage"/);
    expect(workflow).toMatch(
      /COVERAGE_FILE: \$\{\{ runner.temp \}\}\/coverage\/coverage-final.json/,
    );
    const runs = [...workflow.matchAll(/ {8}run: \|\n((?: {10}.*\n|\n)*)/g)];
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.map((match) => match[1]).join('\n')).not.toMatch(
      /\b(?:pnpm|npm|npx|yarn)\b|node\s+pr\//,
    );
  });

  it('regrades when any required-check workflow completes', () => {
    const workflow = readFileSync('.github/workflows/confidence.yml', 'utf8');
    const watched = workflow.match(/^ {4}workflows: \[(.+)\]$/m)?.[1]?.split(', ');
    for (const file of new Set(REQUIRED_GATES.map((gate) => gate.workflow))) {
      const name = readFileSync(`.github/workflows/${file}`, 'utf8').match(/^name: (.+)$/m)?.[1];
      expect(watched).toContain(name);
    }
    expect(workflow).toContain('    types: [completed]');
  });
});

describe('sliceOf', () => {
  it('reads a route slice in the reference result', () => {
    expect(sliceOf('apps/web/src/routes/greeting/GreetingPage.tsx')).toEqual({
      result: 'apps',
      kind: 'routes',
      name: 'greeting',
    });
  });

  it('reads a feature slice in a showcase result', () => {
    expect(sliceOf('showcase/todo-01/web/src/features/page-header/PageHeader.tsx')).toEqual({
      result: 'showcase/todo-01',
      kind: 'features',
      name: 'page-header',
    });
  });

  it('ignores a file outside a route or feature slice', () => {
    expect(sliceOf('apps/web/src/api-client/trpc.ts')).toBeUndefined();
    expect(sliceOf('docs/prd/greeting.md')).toBeUndefined();
  });
});

describe('collectSlices', () => {
  it('collects the unique slices the changed files touch', () => {
    expect(
      collectSlices([
        'apps/web/src/routes/greeting/GreetingPage.tsx',
        'apps/web/src/routes/greeting/useGreeting.ts',
        'apps/web/src/features/page-header/PageHeader.tsx',
        'README.md',
      ]),
    ).toEqual([
      { result: 'apps', kind: 'routes', name: 'greeting' },
      { result: 'apps', kind: 'features', name: 'page-header' },
    ]);
  });
});

describe('coverageGaps', () => {
  it('matches whole slugs rather than prefixes', () => {
    const slices = collectSlices(['apps/web/src/features/greet/Greet.tsx']);
    expect(coverageGaps(slices, [greetingSpec])).toHaveLength(1);
  });

  it('normalizes spaced words to a hyphenated slug', () => {
    const slices = collectSlices(['apps/web/src/features/page-header/PageHeader.tsx']);
    expect(coverageGaps(slices, [{ ...greetingSpec, text: 'Page Header' }])).toEqual([]);
  });

  it('passes a changed slice a spec in its result names', () => {
    const slices = collectSlices(['apps/web/src/routes/greeting/GreetingPage.tsx']);
    expect(coverageGaps(slices, [greetingSpec])).toEqual([]);
  });

  it('reports a changed slice no spec names', () => {
    const slices = collectSlices(['apps/web/src/features/page-header/PageHeader.tsx']);
    const gaps = coverageGaps(slices, [greetingSpec]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('page-header');
    expect(gaps[0]).toContain('apps/web/e2e/');
  });

  it('only counts specs in the slice’s own result', () => {
    const slices = collectSlices(['showcase/todo-01/web/src/routes/greeting/GreetingPage.tsx']);
    // The reference spec names "greeting" but lives in another result.
    expect(coverageGaps(slices, [greetingSpec])).toHaveLength(1);
  });
});

describe('prdGaps', () => {
  it('requires the PRD to link a spec in the slice’s own result', () => {
    const slices = collectSlices([
      'apps/web/src/routes/greeting/GreetingPage.tsx',
      'showcase/todo-01/web/src/routes/greeting/GreetingPage.tsx',
    ]);
    const gaps = prdGaps(slices, [greetingPrd]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('showcase/todo-01');
    expect(prdGaps(slices, [{ ...greetingPrd, text: '# Greeting' }])).toHaveLength(2);
  });

  it('matches whole PRD slugs and normalizes spaced words', () => {
    const slices = collectSlices(['apps/web/src/features/greet/Greet.tsx']);
    expect(prdGaps(slices, [greetingPrd])).toHaveLength(1);
    const header = collectSlices(['apps/web/src/features/page-header/PageHeader.tsx']);
    expect(prdGaps(header, [{ ...greetingPrd, text: `Page Header\n${greetingPrd.text}` }])).toEqual(
      [],
    );
  });

  it('passes a changed slice a PRD names', () => {
    const slices = collectSlices(['apps/web/src/routes/greeting/GreetingPage.tsx']);
    expect(prdGaps(slices, [greetingPrd])).toEqual([]);
  });

  it('reports a changed slice no PRD names', () => {
    const slices = collectSlices(['apps/web/src/features/page-header/PageHeader.tsx']);
    const gaps = prdGaps(slices, [greetingPrd]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('page-header');
    expect(gaps[0]).toContain('docs/prd/');
  });
});

describe('requiredCheckNames', () => {
  it('includes the aggregate and the stand-alone checks', () => {
    const names = requiredCheckNames();
    expect(names).toEqual([
      AGGREGATE.check,
      ...REQUIRED_GATES.filter((gate) => gate.judgedBy === 'branch protection').map(
        (gate) => gate.check,
      ),
    ]);
  });
});

describe('requiredCheckResults', () => {
  const names = ['Required gates'];

  it('marks a name with no run as missing', () => {
    expect(requiredCheckResults([], names)).toEqual([
      { name: 'Required gates', conclusion: 'missing' },
    ]);
  });

  it('marks a run still going as pending', () => {
    expect(
      requiredCheckResults([{ name: 'Required gates', status: 'in_progress' }], names),
    ).toEqual([{ name: 'Required gates', conclusion: 'pending' }]);
  });

  it('takes a completed run’s conclusion', () => {
    expect(
      requiredCheckResults(
        [{ name: 'Required gates', status: 'completed', conclusion: 'success' }],
        names,
      ),
    ).toEqual([{ name: 'Required gates', conclusion: 'success' }]);
  });

  it.each([
    ['failure', 'success'],
    ['success', 'failure'],
  ])('uses the latest run after %s then %s, independent of API order', (older, latest) => {
    const runs = [
      {
        id: 20,
        name: 'Required gates',
        started_at: '2026-10-22T09:00:00Z',
        status: 'completed',
        conclusion: older,
      },
      {
        id: 10,
        name: 'Required gates',
        started_at: '2026-10-22T10:00:00Z',
        status: 'completed',
        conclusion: latest,
      },
    ];
    expect(requiredCheckResults(runs, names)).toEqual([
      { name: 'Required gates', conclusion: latest },
    ]);
    expect(requiredCheckResults([...runs].reverse(), names)).toEqual([
      { name: 'Required gates', conclusion: latest },
    ]);
  });

  it('breaks equal start times by the highest run id', () => {
    const run = { name: 'Required gates', started_at: '2026-10-22T10:00:00Z', status: 'completed' };
    expect(
      requiredCheckResults(
        [
          { ...run, id: 20, conclusion: 'success' },
          { ...run, id: 10, conclusion: 'failure' },
        ],
        names,
      ),
    ).toEqual([{ name: 'Required gates', conclusion: 'success' }]);
  });

  it('allows skips only for stand-alone gates with a declared if', () => {
    const results = requiredCheckResults([
      { name: 'Validate PR body and title', status: 'completed', conclusion: 'skipped' },
      { name: 'Required gates', status: 'completed', conclusion: 'skipped' },
      { name: 'Lighthouse budgets', status: 'completed', conclusion: 'skipped' },
    ]);
    expect(results).toContainEqual({ name: 'Validate PR body and title', conclusion: 'success' });
    expect(results).toContainEqual({ name: 'Required gates', conclusion: 'skipped' });
    expect(results).toContainEqual({ name: 'Lighthouse budgets', conclusion: 'skipped' });
  });

  it('fails when the latest run for a name did not succeed', () => {
    expect(
      requiredCheckResults(
        [
          { id: 1, name: 'Required gates', status: 'completed', conclusion: 'success' },
          { id: 2, name: 'Required gates', status: 'completed', conclusion: 'failure' },
        ],
        names,
      ),
    ).toEqual([{ name: 'Required gates', conclusion: 'failure' }]);
  });
});

describe('CLI', () => {
  let root: string;
  const passingRuns = () =>
    JSON.stringify(
      requiredCheckNames().map((name, id) => ({
        id,
        name,
        started_at: '2026-10-22T10:00:00Z',
        status: 'completed',
        conclusion: 'success',
      })),
    );
  const run = (mode: string, env: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, ['scripts/confidence-label.mjs', mode], {
      encoding: 'utf8',
      env: { ...process.env, PR_ROOT: root, ...env },
    });

  const writeCoverage = (coverage = coverageMap(coverageEntry())) => {
    const path = join(root, 'coverage.json');
    writeFileSync(path, JSON.stringify(coverage));
    return path;
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'confidence-label-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads the PR checkout as data and writes the amber label and gap summary', () => {
    for (const file of [greetingSpec, greetingPrd]) {
      const path = join(root, file.path.replaceAll('greeting', 'fixture-covered'));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        file.text.replaceAll('greeting', 'fixture-covered').replace('Greeting', 'Fixture Covered'),
      );
    }
    const output = join(root, 'output');
    const summary = join(root, 'summary');
    const result = run('--decide', {
      CHANGED:
        'apps/web/src/routes/fixture-covered/Page.tsx\napps/web/src/features/page-header/PageHeader.tsx',
      CHECK_RUNS: passingRuns(),
      COVERAGE_FILE: writeCoverage(),
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('confidence: amber');
    expect(readFileSync(output, 'utf8')).toBe('level=amber\nlabel=confidence: amber\n');
    const reasons = readFileSync(summary, 'utf8');
    expect(reasons).toContain('## Merge confidence: Amber');
    expect(reasons).toContain('`page-header`');
    expect(reasons).toContain('no E2E spec');
    expect(reasons).toContain('no PRD');
    expect(reasons).not.toContain('`fixture-covered`');
  });

  it.each([
    ['threshold', 'green', [1, 1, 1, 1, 0], true, coveredSource, 'meets the line-coverage'],
    ['low', 'amber', [1, 1, 1, 0], true, coveredSource, '75%'],
    ['absent', 'amber', [1], true, 'packages/ui/src/Other.tsx', 'has no entry'],
    ['deleted', 'green', [1], false, 'packages/ui/src/Other.tsx', 'meets the line-coverage'],
    ['excluded', 'green', [1], true, 'jest.config.ts', 'meets the line-coverage'],
  ])('grades %s coverage through workflow outputs', (_, level, counts, exists, changed, reason) => {
    [greetingSpec, greetingPrd].forEach((file) => {
      const path = join(root, file.path.replaceAll('greeting', 'fixture-covered'));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        file.text.replaceAll('greeting', 'fixture-covered').replace('Greeting', 'Fixture Covered'),
      );
    });
    if (exists) {
      const path = join(root, changed);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'throw new Error("PR code must never execute");');
    }
    const output = join(root, 'output');
    const summary = join(root, 'summary');
    const result = run('--decide', {
      CHANGED: [changed, 'apps/web/src/x.test.ts', 'apps/web/e2e/x.spec.ts', 'README.md'].join(
        '\n',
      ),
      CHECK_RUNS: passingRuns(),
      COVERAGE_FILE: writeCoverage(coverageMap(coverageEntry(coveredSource, counts))),
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    });
    expect(result.status).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(`level=${level}\nlabel=confidence: ${level}\n`);
    const reasons = readFileSync(summary, 'utf8');
    expect(reasons).toContain(reason);
    if (level === 'amber') expect(reasons).toContain(`\`${changed}\``);
  });

  it.each([
    'unset',
    'missing',
    'malformed',
    'unreadable',
  ])('fails closed for %s coverage', (kind) => {
    const path = join(root, 'coverage.json');
    if (kind === 'malformed') writeFileSync(path, 'not json');
    const output = join(root, 'output');
    const summary = join(root, 'summary');
    const result = run('--decide', {
      CHANGED: '',
      CHECK_RUNS: passingRuns(),
      COVERAGE_FILE: kind === 'unset' ? undefined : kind === 'unreadable' ? root : path,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    });
    expect(result.status).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe('level=red\nlabel=confidence: red\n');
    expect(readFileSync(summary, 'utf8')).toContain('coverage unavailable');
  });

  it.each([undefined, '', 'not json', '{}', 'null'])('rejects invalid CHECK_RUNS: %s', (value) => {
    const result = run('--decide', { CHECK_RUNS: value });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/CHECK_RUNS.*JSON array/);
  });

  it('rejects a missing PR_ROOT', () => {
    const result = run('--decide', { CHECK_RUNS: '[]', PR_ROOT: join(root, 'missing') });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/PR_ROOT.*exist/);
  });

  it('accepts an empty changed-file list', () => {
    const result = run('--decide', {
      CHANGED: '',
      CHECK_RUNS: passingRuns(),
      COVERAGE_FILE: writeCoverage(),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('confidence: green');
  });

  it('prints three label definitions', () => {
    const result = run('--labels');
    expect(result.status).toBe(0);
    const labels = JSON.parse(result.stdout);
    expect(labels).toHaveLength(3);
    expect(labels.map((label: { name: string }) => label.name)).toEqual([
      'confidence: green',
      'confidence: amber',
      'confidence: red',
    ]);
    for (const label of labels) {
      expect(label).toEqual({
        name: expect.any(String),
        color: expect.stringMatching(/^[0-9a-f]{6}$/),
        description: expect.any(String),
      });
    }
  });
});

describe('decideConfidence', () => {
  const allPassing = [{ name: 'Required gates', conclusion: 'success' }];

  it.each([
    'success',
    'failure',
  ])('grades unavailable coverage red alongside %s checks', (conclusion) => {
    const decision = decideConfidence({
      requiredChecks: [{ name: 'Required gates', conclusion }],
      gaps: [],
      coverageUnavailable: true,
    });
    expect(decision.level).toBe('red');
    expect(decision.reasons.at(-1)).toContain('coverage unavailable');
    expect(decision.reasons).toHaveLength(conclusion === 'success' ? 1 : 2);
  });

  it('grades red when a required check is not success', () => {
    const decision = decideConfidence({
      requiredChecks: [
        { name: 'Required gates', conclusion: 'failure' },
        { name: 'Lighthouse budgets', conclusion: 'pending' },
      ],
      gaps: [],
    });
    expect(decision.level).toBe('red');
    expect(decision.reasons).toHaveLength(2);
    expect(decision.reasons[0]).toContain('Required gates');
  });

  it('grades amber when every check passes but a gap remains', () => {
    const decision = decideConfidence({
      requiredChecks: allPassing,
      gaps: ['The feature slice `page-header` (apps) changed, and no E2E spec names it.'],
    });
    expect(decision.level).toBe('amber');
    expect(decision.reasons).toHaveLength(1);
  });

  it('grades green when every check passes and no gap remains', () => {
    const decision = decideConfidence({ requiredChecks: allPassing, gaps: [] });
    expect(decision.level).toBe('green');
  });
});

describe('labels', () => {
  it('maps every level to its label', () => {
    expect(CONFIDENCE_LABELS).toEqual({
      green: 'confidence: green',
      amber: 'confidence: amber',
      red: 'confidence: red',
    });
  });

  it('defines a colour and description for each label', () => {
    for (const level of Object.keys(CONFIDENCE_LABELS)) {
      const def = CONFIDENCE_LABEL_DEFS[level as keyof typeof CONFIDENCE_LABEL_DEFS];
      expect(def.name).toBe(CONFIDENCE_LABELS[level as keyof typeof CONFIDENCE_LABELS]);
      expect(def.color).toMatch(/^[0-9a-f]{6}$/);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.description.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('renderSummary', () => {
  it('renders the level and its reasons as Markdown', () => {
    const summary = renderSummary({ level: 'amber', reasons: ['A gap.'] });
    expect(summary).toContain('## Merge confidence: Amber');
    expect(summary).toContain('- A gap.');
  });
});
