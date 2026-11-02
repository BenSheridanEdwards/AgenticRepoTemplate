import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const checkouts = (text: string) =>
  text.split(/^ {2}(?=[\w-]+:)/m).flatMap((job) =>
    job
      .split(/(?=^ {6}- )/m)
      .filter((step) => step.includes('uses: actions/checkout@'))
      .map((step) => ({ job: job.split(':')[0].trim(), step })),
  );
const missingFilters = (text: string) =>
  checkouts(text).filter(
    ({ job, step }) =>
      job !== 'security' && /fetch-depth: 0\s/.test(step) && !step.includes('filter: blob:none'),
  );

test('full-history checkouts outside security use blobless history', () => {
  expect(
    checkouts(workflow)
      .filter(({ step }) => /fetch-depth: 0\s/.test(step))
      .map(({ job }) => job),
  ).toEqual(['up-to-date', 'quality', 'fallow', 'coverage', 'security']);
  expect(missingFilters(workflow)).toEqual([]);
});

test('security reads full history without a partial-clone filter', () => {
  const security = checkouts(workflow).filter(({ job }) => job === 'security');
  expect(security).toHaveLength(1);
  expect(security[0].step).toContain('fetch-depth: 0');
  expect(security[0].step).not.toMatch(/filter:/);
});

test('removing the quality filter is detected', () => {
  const changed = workflow.replace(/( {2}quality:[\s\S]*?) {10}filter: blob:none\n/, '$1');
  expect(missingFilters(changed).map(({ job }) => job)).toEqual(['quality']);
});
