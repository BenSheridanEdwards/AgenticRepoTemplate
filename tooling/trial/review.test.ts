/**
 * @jest-environment node
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { planReview, runReview, validateReview } from './review.mjs';
import { systemDeps } from './run-trial.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const RECORD = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/todo-01.json'), 'utf8'));
const ANSWER = {
  wouldWant: 'no',
  why: 'The domain trusts unparsed input.',
  flags: [
    {
      group: 'type assertions',
      file: 'showcase/todo-01/api/src/domain.ts',
      line: 1,
      note: 'A chain of casts.',
    },
  ],
  praise: [{ file: 'showcase/todo-01/web/src/main.tsx', line: null, note: 'Small entry point.' }],
};
const SLOP = 'export const parse = (input: unknown) => input as string as number;\n';

let caseDir: string;
let root: string;
let workdir: string;

const put = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

/** A check clone that lints as the scaffold does: its configs, plugins and installed tools. */
function checkClone() {
  const clone = join(workdir, 'check');
  mkdirSync(clone, { recursive: true });
  ['node_modules', 'vendor', 'tooling'].forEach((name) => {
    symlinkSync(join(ROOT, name), join(clone, name), 'dir');
  });
  ['.oxlintrc.json', 'oxlint.config.ts'].forEach((name) => {
    copyFileSync(join(ROOT, name), join(clone, name));
  });
  put(join(clone, 'showcase/todo-01/api/src/domain.ts'), SLOP);
  put(join(clone, 'showcase/todo-01/web/src/main.tsx'), 'export {};\n');
  return clone;
}

/**
 * A reviewer that records its call and answers as Codex (`-o` file) or Claude does: in
 * `structured_output` when it got `--json-schema`, or, with `textOnly`, in its result text.
 */
function fakeReviewer(answer: typeof ANSWER | string = ANSWER, textOnly = false) {
  const path = join(caseDir, 'reviewer.mjs');
  const text = typeof answer === 'string' ? answer : JSON.stringify(answer);
  put(
    path,
    `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
if (argv[0] === '--version') { console.log('fake-reviewer 1.0.0'); process.exit(0); }
const stdin = readFileSync(0, 'utf8');
writeFileSync(${JSON.stringify(`${path}.call.json`)}, JSON.stringify({ argv, stdin, cwd: process.cwd() }));
const answer = ${JSON.stringify(text)};
const emit = (fields) => console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, ...fields }));
if (argv[0] === 'exec') writeFileSync(argv[argv.indexOf('-o') + 1], answer);
else if (argv.includes('--json-schema') && !${textOnly}) emit({ structured_output: JSON.parse(answer), result: '' });
else emit({ result: 'Here it is: ' + answer });
`,
  );
  chmodSync(path, 0o755);
  return path;
}

const lastCall = (reviewer: string) => JSON.parse(readFileSync(`${reviewer}.call.json`, 'utf8'));
const review = (agent: 'claude' | 'codex', agentCommand = fakeReviewer()) =>
  runReview(planReview({ id: 'todo-01', workdir, root, agent, agentCommand }), systemDeps());
const reviewPath = () => join(root, 'docs/trials/todo-01.review.json');

beforeEach(() => {
  caseDir = mkdtempSync(join(tmpdir(), 'review-'));
  root = join(caseDir, 'checkout');
  workdir = join(caseDir, 'todo-01-20261103T120000Z');
  put(join(root, 'docs/trials/todo-01.json'), JSON.stringify(RECORD));
});

afterEach(() => {
  rmSync(caseDir, { recursive: true, force: true });
});

describe('runReview', () => {
  it('records the anti-slop findings in the result, which the gate config ignores, and the judgment', async () => {
    const clone = checkClone();
    const reviewer = fakeReviewer();

    const written = await review('claude', reviewer);

    expect(JSON.parse(readFileSync(reviewPath(), 'utf8'))).toEqual(written);
    expect(validateReview(written)).toEqual(written);
    expect(written.lint['anti-slop']).toMatchObject({
      config: '.oxlintrc.json',
      unignored: ['showcase/**'],
      exitCode: 1,
      files: 2,
    });
    expect(written.lint['anti-slop'].rules).toContainEqual({
      rule: 'anti-slop/no-chained-type-assertions',
      count: 1,
      examples: [
        {
          file: 'showcase/todo-01/api/src/domain.ts',
          line: 1,
          message: expect.stringContaining('assertion chain'),
        },
      ],
    });
    expect(written.lint.policy).toMatchObject({ config: 'oxlint.config.ts', unignored: [] });
    expect(written).toMatchObject({
      id: 'todo-01',
      read: 'check',
      run: { agent: 'claude', status: 'failed', patch: RECORD.result.patch },
      reviewer: { name: 'claude', version: 'fake-reviewer 1.0.0', fake: true },
      judgment: ANSWER,
    });
    const call = lastCall(reviewer);
    expect(call.cwd).toBe(clone);
    expect(call.stdin).toContain('Read the code in `showcase/todo-01/`.');
    expect(call.stdin).toContain('would you want this code as your codebase?');
    expect(call.argv.slice(call.argv.indexOf('--tools'), call.argv.indexOf('--tools') + 4)).toEqual(
      ['--tools', 'Read,Grep,Glob', '--max-turns', '100'],
    );
    expect(JSON.stringify(written.reviewer.argv)).not.toContain(workdir);
  });

  it('runs Codex in its read-only sandbox and reads the answer from its last message file', async () => {
    checkClone();
    const reviewer = fakeReviewer();

    const written = await review('codex', reviewer);

    expect(written.judgment).toEqual(ANSWER);
    expect(written.reviewer.name).toBe('codex');
    expect(lastCall(reviewer).argv.slice(0, 3)).toEqual(['exec', '--sandbox', 'read-only']);
    expect(written.reviewer.argv).toContain('{workdir}/check');
  });

  it("reads Claude's answer from its result text when it gives no structured output", async () => {
    checkClone();

    expect((await review('claude', fakeReviewer(ANSWER, true))).judgment).toEqual(ANSWER);
  });

  it('records zero findings for a result with no file to lint', async () => {
    checkClone();
    rmSync(join(workdir, 'check/showcase/todo-01'), { recursive: true });
    put(join(workdir, 'check/showcase/todo-01/web/package.json'), '{}\n');

    const written = await review('claude');

    ['anti-slop', 'policy'].forEach((name) => {
      expect(written.lint[name]).toMatchObject({ files: 0, findings: 0, rules: [] });
    });
  });

  it('reviews the agent clone when no check clone was made', async () => {
    put(join(workdir, 'repo/showcase/todo-01/web/src/main.tsx'), 'export {};\n');
    symlinkSync(join(ROOT, 'node_modules'), join(workdir, 'repo/node_modules'), 'dir');
    symlinkSync(join(ROOT, 'vendor'), join(workdir, 'repo/vendor'), 'dir');
    symlinkSync(join(ROOT, 'tooling'), join(workdir, 'repo/tooling'), 'dir');
    ['.oxlintrc.json', 'oxlint.config.ts'].forEach((name) => {
      copyFileSync(join(ROOT, name), join(workdir, 'repo', name));
    });

    expect((await review('claude')).read).toBe('repo');
  });

  it.each([
    [
      'the review exists',
      () => {
        checkClone();
        put(reviewPath(), '{}\n');
      },
      'Every review counts',
    ],
    ['the workdir is gone', () => undefined, 'Review each run before you remove its workdir'],
    [
      'the record names another run',
      () => {
        checkClone();
        put(
          join(root, 'docs/trials/todo-01.json'),
          JSON.stringify({
            ...RECORD,
            trial: { ...RECORD.trial, number: 2, id: 'todo-02', branch: 'trial/todo-02' },
          }),
        );
      },
      'is not the to-do run todo-01',
    ],
  ])('writes nothing when %s', async (_case, arrange, message) => {
    arrange();
    const kept = () => (existsSync(reviewPath()) ? readFileSync(reviewPath(), 'utf8') : null);
    const before = kept();
    await expect(review('claude')).rejects.toThrow(message);
    expect(kept()).toBe(before);
  });

  it('writes nothing when the reviewer gives no valid answer', async () => {
    checkClone();

    await expect(review('claude', fakeReviewer({ ...ANSWER, wouldWant: 'maybe' }))).rejects.toThrow(
      'judgment.wouldWant',
    );
    expect(existsSync(reviewPath())).toBe(false);
  });
});
