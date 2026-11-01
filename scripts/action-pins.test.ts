import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';

const read = (path: string) => readFileSync(path, 'utf8');
const yamlFiles = (directory: string): string[] =>
  existsSync(directory)
    ? readdirSync(directory, { recursive: true, encoding: 'utf8' })
        .filter((path) => matchesGlob(path, '**/*.{yml,yaml}'))
        .map((path) => join(directory, path))
    : [];
const workflows = yamlFiles('.github/workflows');
const actionFiles = [...workflows, ...yamlFiles('.github/actions')];

// Read a YAML field with its indented body, as required-gates does for jobs.
function fields(text: string, key: string) {
  const lines = text.split('\n');
  return lines.flatMap((line, index) => {
    const match = line.match(new RegExp(`^( *)(?:- )?${key}: *(.*)$`));
    if (!match) return [];
    const indentation = match[1].length + (line.trimStart().startsWith('- ') ? 2 : 0);
    const following = lines.slice(index + 1);
    const end = following.findIndex(
      (next) =>
        next.trim() !== '' && !next.trimStart().startsWith('#') && next.search(/\S/) <= indentation,
    );
    return [{ value: match[2], body: following.slice(0, end < 0 ? undefined : end).join('\n') }];
  });
}

function invalidPins(text: string) {
  return fields(text, 'uses').filter(
    ({ value }) =>
      !value.startsWith('./') &&
      !/^[\w.-]+\/[\w./-]+@[a-f0-9]{40} # v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value),
  );
}

function unsafeScripts(text: string) {
  const events = fields(text, 'on');
  if (
    !events.some(({ value, body }) =>
      /\b(pull_request_target|issue_comment|workflow_run)\b/.test(`${value}\n${body}`),
    )
  )
    return [];
  return [...fields(text, 'run'), ...fields(text, 'script')].filter(({ value, body }) =>
    `${value}\n${body}`.includes('${{'),
  );
}

function permissionState(text: string) {
  const grants = (source: string) =>
    fields(source, 'permissions').map(({ value, body }) =>
      `${value}${body}`
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    );
  const jobs = fields(text, 'jobs')[0]?.body ?? '';
  const names = [...jobs.matchAll(/^ {2}([\w-]+):/gm)].map((match) => match[1]);
  return {
    workflow: grants(text.split(/^jobs:/m)[0]),
    jobs: Object.fromEntries(
      names.map((name) => [name, grants(fields(jobs, name)[0]?.body ?? '')]),
    ),
  };
}

const readOnly = [['contents: read']];
const baseline = {
  'ci.yml': {
    workflow: readOnly,
    jobs: {
      'up-to-date': [],
      quality: [],
      fallow: [['contents: read', 'pull-requests: write']],
      test: [],
      tooling: [],
      integration: [],
      coverage: [],
      build: [],
      e2e: [],
      security: [],
      'required-gates': [],
    },
  },
  'codeql.yml': {
    workflow: [['actions: read', 'contents: read', 'security-events: write']],
    jobs: { analyze: [] },
  },
  'confidence.yml': {
    workflow: [['{}']],
    jobs: {
      confidence: [['contents: read', 'actions: read', 'checks: read', 'pull-requests: write']],
    },
  },
  'enforcement-approval.yml': {
    workflow: [['{}']],
    jobs: { approve: [['contents: read', 'pull-requests: write', 'statuses: write']] },
  },
  'lighthouse.yml': { workflow: readOnly, jobs: { lighthouse: [] } },
  'main-tree.yml': {
    workflow: readOnly,
    jobs: { decide: [['contents: read', 'pull-requests: read', 'checks: read', 'actions: write']] },
  },
  'pr-quality.yml': { workflow: readOnly, jobs: { 'pr-body': [] } },
  'visual.yml': { workflow: readOnly, jobs: { visual: [] } },
};

it.each(actionFiles)('%s pins every remote action with a version comment', (path) => {
  expect(invalidPins(read(path))).toEqual([]);
});

it.each(actionFiles)('%s uses only the cleared cache and download commits', (path) => {
  fields(read(path), 'uses').forEach(({ value }) => {
    if (/^actions\/cache(?:\/(?:restore|save))?@/.test(value))
      expect(value.split('@')[1]?.split(' ')[0]).toBe('55cc8345863c7cc4c66a329aec7e433d2d1c52a9');
    if (value.startsWith('actions/download-artifact@'))
      expect(value.split('@')[1]?.split(' ')[0]).toBe('9000827ccba6bdab643e8b6fd33ac0654aef8333');
  });
});

it.each(workflows)('%s passes privileged event input through context or env', (path) => {
  expect(unsafeScripts(read(path))).toEqual([]);
});

it('preserves every workflow and job permission from the baseline', () => {
  expect(
    Object.fromEntries(
      workflows.map((path) => [path.split('/').at(-1), permissionState(read(path))]),
    ),
  ).toEqual(baseline);
});

it('schedules only weekly github-actions updates with a seven-day cooldown', () => {
  const text = read('.github/dependabot.yml');
  expect(fields(text, 'package-ecosystem').map(({ value }) => value.replaceAll('"', ''))).toEqual([
    'github-actions',
  ]);
  expect(fields(text, 'directory').map(({ value }) => value.replaceAll('"', ''))).toEqual(['/']);
  expect(fields(text, 'interval').map(({ value }) => value.replaceAll('"', ''))).toEqual([
    'weekly',
  ]);
  const days = fields(text, 'default-days');
  expect(days).toHaveLength(1);
  expect(Number(days[0]?.value)).toBeGreaterThanOrEqual(7);
});

it.each([
  'pull_request_target',
  'issue_comment',
  'workflow_run',
])('rejects seeded injection on %s', (event) => {
  const prefix = `on:\n  ${event}:\njobs:\n  check:\n    steps:\n`;
  expect(unsafeScripts(`${prefix}      - run: echo \${{ github.event.issue.title }}`)).toHaveLength(
    1,
  );
  expect(
    unsafeScripts(
      `${prefix}      - with:\n          script: |\n            consume('\${{ github.event.comment.body }}');`,
    ),
  ).toHaveLength(1);
  expect(
    unsafeScripts(
      `${prefix}      - env:\n          TITLE: \${{ github.event.issue.title }}\n        run: echo "$TITLE"`,
    ),
  ).toEqual([]);
});

it('rejects seeded workflow and job permission changes', () => {
  const text = read('.github/workflows/confidence.yml');
  expect(permissionState(text.replace('permissions: {}', 'permissions: write-all'))).not.toEqual(
    baseline['confidence.yml'],
  );
  expect(permissionState(text.replace('actions: read', 'actions: write'))).not.toEqual(
    baseline['confidence.yml'],
  );
});

it('rejects tags, short SHAs and missing comments while allowing local actions', () => {
  expect(invalidPins('uses: ./local')).toEqual([]);
  expect(invalidPins('uses: actions/checkout@v7')).toHaveLength(1);
  expect(invalidPins('uses: actions/checkout@1234567 # v7.0.1')).toHaveLength(1);
  expect(invalidPins(`uses: actions/checkout@${'a'.repeat(40)}`)).toHaveLength(1);
});
