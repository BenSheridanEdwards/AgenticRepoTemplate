/**
 * @jest-environment node
 */
import { collectSlices, coverageGaps, prdGaps, sliceOf } from './confidence-label.mjs';

const greetingSpec = {
  path: 'apps/web/e2e/greeting.spec.ts',
  text: "test('greets a name through the api', async () => {});",
};
const greetingPrd = {
  path: 'docs/prd/greeting.md',
  text: '# Greeting\n\n[Greeting](../../apps/web/e2e/greeting.spec.ts)',
};

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
