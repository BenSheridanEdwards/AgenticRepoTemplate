import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = '.github/workflows';
const jobsOf = (text: string) =>
  (text.split(/^jobs:\n/m)[1] ?? '')
    .split(/^(?= {2}[\w-]+:\s*$)/m)
    .filter((job) => job.startsWith('  '));
const minutes = (job: string) => Number(job.match(/^ {4}timeout-minutes: (\d+)$/m)?.[1] ?? 0);

const jobs = readdirSync(WORKFLOWS)
  .filter((name) => name.endsWith('.yml'))
  .flatMap((name) =>
    jobsOf(readFileSync(join(WORKFLOWS, name), 'utf8')).map((job) => ({
      id: `${name}:${job.split(':')[0].trim()}`,
      minutes: minutes(job),
    })),
  );

test('every workflow job sets a timeout so a hung job frees its runner (ADR 0116)', () => {
  expect(jobs.length).toBeGreaterThan(10);
  expect(jobs.filter((job) => job.minutes === 0).map((job) => job.id)).toEqual([]);
});

test('timeouts stay under the hosted 360-minute default', () => {
  expect(jobs.filter((job) => job.minutes > 60).map((job) => job.id)).toEqual([]);
});
