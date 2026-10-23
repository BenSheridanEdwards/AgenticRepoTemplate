import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { coveredPaths, parseBehaviours } from './check-prd-conflicts.mjs';
import {
  CONVENTIONAL_COMMIT_TYPES,
  REQUIRED_SECTIONS,
  readChangedFiles,
  resolveBaseSha,
  resolveHeadSha,
  validatePullRequest,
} from './validate-pr-body.mjs';

// The PR head every body below is checked against.
const HEAD = '0a21f68d4a57e7998b1357444f2bdad00cea6528';
const NORTH_STAR = 'abcdef1234567890abcdef1234567890abcdef12';
const INTENT_PORTS = {
  listPrdFiles: () => ['docs/prd/greeting.md', 'docs/prd/todo.md'],
  northStarCommit: () => NORTH_STAR,
  changedFiles: [] as string[],
  prdCoverage: [] as { path: string; patterns: string[] }[],
};

// A body that satisfies every rule: all four sections in order, each with real
// content, inline-image proof, and a head commit naming HEAD.
const VALID_BODY = [
  '# Why does this feature exist?',
  '',
  'Reviewers cannot currently see whether a PR proved its behaviour.',
  '',
  '# What changed?',
  '',
  '- Added a machine validator for the PR body.',
  '',
  '# Behavioural Proof (with video and screenshots)',
  '',
  '![the counter at capacity](https://github.com/o/r/blob/b/docs/proof/x/at-capacity.png?raw=1)',
  '',
  '# Verification Summary',
  '',
  '- Head commit: 0a21f68',
  '- PRDs checked: docs/prd/greeting.md',
  '- North Star commit: abcdef1',
  '- PRD impact: None',
  '- Commands run: `pnpm verify`, `pnpm e2e`.',
  '- Results: all green.',
].join('\n');

const VALID_TITLE = 'feat(pr-quality): validate PR bodies in CI';

describe('validatePullRequest', () => {
  it('passes a well-formed body and title', () => {
    const result = validatePullRequest({
      ...INTENT_PORTS,
      title: VALID_TITLE,
      body: VALID_BODY,
      headSha: HEAD,
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('fails when a required section is missing', () => {
    const withoutVerification = VALID_BODY.replace(/# Verification Summary[\s\S]*$/, '');
    const result = validatePullRequest({
      ...INTENT_PORTS,
      title: VALID_TITLE,
      body: withoutVerification,
      headSha: HEAD,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Verification Summary');
  });

  it('fails when a section is placeholder-only (bare bullets)', () => {
    const placeholderProof = VALID_BODY.replace(
      /# What changed\?[\s\S]*?(?=# Behavioural Proof)/,
      '# What changed?\n\n-\n\n',
    );
    const result = validatePullRequest({
      ...INTENT_PORTS,
      title: VALID_TITLE,
      body: placeholderProof,
      headSha: HEAD,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('placeholder-only');
  });

  it('fails when the proof section has neither an image nor "Not applicable"', () => {
    const noProof = VALID_BODY.replace(
      /!\[the counter at capacity\].*\)/,
      'The build passed, so this is fine.',
    );
    const result = validatePullRequest({
      ...INTENT_PORTS,
      title: VALID_TITLE,
      body: noProof,
      headSha: HEAD,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('no proof');
  });

  it('accepts "Not applicable" as proof for non-UI changes', () => {
    const notApplicable = VALID_BODY.replace(
      /!\[the counter at capacity\].*\)/,
      'Not applicable — no rendered UI surface changed.',
    );
    const result = validatePullRequest({
      ...INTENT_PORTS,
      title: VALID_TITLE,
      body: notApplicable,
      headSha: HEAD,
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('strips HTML comments completely, even when they overlap (fixpoint)', () => {
    // A single-pass strip would remove the inner `<!-- ... -->` and splice the
    // remainder into a surviving `<!--`, letting comment-only content masquerade
    // as proof. The fixpoint strip must remove it all, so this proof section is
    // treated as empty and fails.
    const overlappingComment = VALID_BODY.replace(
      /!\[the counter at capacity\].*\)/,
      '<!-<!-- x -->- still a comment -->',
    );
    const result = validatePullRequest({
      ...INTENT_PORTS,
      title: VALID_TITLE,
      body: overlappingComment,
      headSha: HEAD,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('no proof');
  });

  it('fails a non-Conventional-Commits title', () => {
    const result = validatePullRequest({
      ...INTENT_PORTS,
      title: '[claude] add PR validator',
      body: VALID_BODY,
      headSha: HEAD,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Conventional Commits');
  });

  const withHeadCommit = (field: string) => VALID_BODY.replace('- Head commit: 0a21f68', field);
  const headErrors = (field: string, headSha: string | null) =>
    validatePullRequest({
      ...INTENT_PORTS,
      title: VALID_TITLE,
      body: withHeadCommit(field),
      headSha,
    }).errors;

  it('passes when the head commit names the PR head: full, short, uppercase, or next line', () => {
    for (const field of [
      `- Head commit: ${HEAD}`,
      '- Head commit: `0a21f68`',
      '- Head commit: 0A21F68',
      '- Head commit:\n  0a21f68',
      '- Head commit:\n\n  0a21f68',
    ]) {
      expect(headErrors(field, HEAD)).toEqual([]);
    }
  });

  it('reads only the label line, so prose after the field is not part of it', () => {
    expect(headErrors('- Head commit: 0a21f68\n\nAll green.', HEAD)).toEqual([]);
  });

  it('fails when the head commit is older than the PR head (#57: body at 16b1728, head 0a21f68)', () => {
    expect(headErrors('- Head commit: 16b1728', HEAD)).toEqual([
      '`- Head commit:` says 16b1728, but the PR head is 0a21f68d4a57. ' +
        'Re-check the body against the new head, then update the field.',
    ]);
  });

  it('compares a label variant too, so a note in the label cannot skip the check', () => {
    expect(headErrors('- Head commit (short): 16b1728', HEAD).join('\n')).toContain('says 16b1728');
  });

  it('fails when the head commit is not exactly one SHA, including None', () => {
    for (const field of [
      '- Head commit: None',
      '- Head commit: the latest one',
      '- Head commit: 0a21f68 (was 16b1728)',
      '- Head commit: 0a21f68, 20261016',
      '- Head commit: `0a21f68',
      '- Head commit: 0a21f68`',
      '- Head commit:',
    ]) {
      expect(headErrors(field, HEAD).join('\n')).toContain(
        'must be one commit SHA and nothing else',
      );
    }
  });

  it('names the rejected value, cut to 40 characters', () => {
    expect(headErrors('- Head commit: None', HEAD).join('\n')).toContain('got "None".');
    const long = `see ${'x'.repeat(60)}`;
    expect(headErrors(`- Head commit: ${long}`, HEAD).join('\n')).toContain(
      `got "${long.slice(0, 40)}…".`,
    );
  });

  it('fails when the Verification Summary has more than one head commit line', () => {
    expect(headErrors('- Head commit: 0a21f68\n- Head commit: 16b1728', HEAD)).toEqual([
      'Section "Verification Summary" has 2 `- Head commit:` lines. ' +
        'Keep exactly one, naming the SHA the whole body was checked against.',
    ]);
  });

  it('grades the Verification Summary the structure check located, not an earlier decoy', () => {
    const decoy = withHeadCommit('- Head commit: 16b1728').replace(
      '# Behavioural Proof',
      '# Verification Summary\n\n- Head commit: 0a21f68\n\n# Behavioural Proof',
    );
    const result = validatePullRequest({
      ...INTENT_PORTS,
      title: VALID_TITLE,
      body: decoy,
      headSha: HEAD,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('says 16b1728');
  });

  it('asks for the SHA, not None, when the Verification Summary has no head commit line', () => {
    expect(headErrors('', HEAD)).toEqual([
      'Section "Verification Summary" has no `- Head commit:` line. ' +
        'Add one naming the SHA the whole body was checked against.',
    ]);
  });

  it('grades only the shape when headSha is explicitly null', () => {
    expect(headErrors('- Head commit: 16b1728', null)).toEqual([]);
    expect(headErrors('- Head commit: None', null).join('\n')).toContain(
      'must be one commit SHA and nothing else',
    );
  });

  it('fails closed when headSha is missing or malformed instead of skipping the comparison', () => {
    for (const headSha of [undefined, '', '0a21f68', `${HEAD}x`]) {
      const result = validatePullRequest({
        ...INTENT_PORTS,
        title: VALID_TITLE,
        body: VALID_BODY,
        headSha,
      });
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain(
        'headSha must be the 40-character PR head SHA or null',
      );
    }
  });

  describe('intent references', () => {
    const withField = (name: string, field: string) =>
      VALID_BODY.replace(new RegExp(`^- ${name}:.*$`, 'm'), field);
    const check = (
      body: string,
      ports: Partial<typeof INTENT_PORTS> = INTENT_PORTS,
      headSha: string | null = HEAD,
    ) => validatePullRequest({ title: VALID_TITLE, body, headSha, ...INTENT_PORTS, ...ports });

    it.each(['PRDs checked', 'North Star commit'])('requires exactly one %s line', (name) => {
      for (const field of ['', `<!-- - ${name}: ignored -->`]) {
        const result = check(withField(name, field));
        expect(result.ok).toBe(false);
        expect(result.errors.join('\n')).toContain(`exactly one \`- ${name}:\` line; found 0`);
      }
      const result = check(`${VALID_BODY}\n- ${name} (again): ignored`);
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain(`exactly one \`- ${name}:\` line; found 2`);
    });

    it.each(['PRDs checked', 'North Star commit'])('ignores a decoy section for %s', (name) => {
      const body = withField(name, '').replace(
        '# Behavioural Proof',
        `# Verification Summary\n- PRDs checked: docs/prd/greeting.md\n- North Star commit: abcdef1\n\n# Behavioural Proof`,
      );
      expect(check(body).errors.join('\n')).toContain(`exactly one \`- ${name}:\` line; found 0`);
    });

    it.each([
      'docs/prd/greeting.md',
      '`docs/prd/greeting.md`, docs/prd/todo.md',
      'None: tooling only',
      'None: docs-only change',
    ])('accepts PRDs checked: %s', (value) => {
      expect(check(withField('PRDs checked', `- PRDs checked: ${value}`))).toEqual({
        ok: true,
        errors: [],
      });
    });

    it.each([
      '',
      'None',
      'None:',
      'None: tooling',
      'None: n/a',
      'None:\n- Commands run: pnpm verify',
      'docs/prd/nested/greeting.md',
      'docs/other.md',
      'docs/prd/greeting.txt',
      'docs/prd/../greeting.md',
      'docs//prd/greeting.md',
      './docs/prd/greeting.md',
      'docs/prd/greeting.md,',
      ',docs/prd/greeting.md',
      'docs/prd/greeting.md, None: tooling only',
      'docs/prd/greeting.md docs/prd/todo.md',
      '`docs/prd/greeting.md',
      'docs/prd/greeting.md`',
      'docs/prd/greeting.md (checked)',
    ])('rejects malformed PRDs checked: %s', (value) => {
      const result = check(withField('PRDs checked', `- PRDs checked: ${value}`));
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('must name comma-separated');
    });

    it('rejects a valid-shaped path missing from the head tree', () => {
      const result = check(withField('PRDs checked', '- PRDs checked: docs/prd/untracked.md'));
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain(
        '"docs/prd/untracked.md", which is not a tracked PRD at the PR head',
      );
    });

    it('requires every PRD in a list to be tracked', () => {
      const result = check(
        withField('PRDs checked', '- PRDs checked: docs/prd/greeting.md, docs/prd/untracked.md'),
      );
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('docs/prd/untracked.md');
    });

    it.each([
      NORTH_STAR,
      'abcdef1',
      '`abcdef1`',
      'ABCDEF1',
    ])('accepts North Star commit: %s', (value) => {
      expect(check(withField('North Star commit', `- North Star commit: ${value}`))).toEqual({
        ok: true,
        errors: [],
      });
    });

    it.each([
      '',
      'None',
      'abcdef',
      'g'.repeat(40),
      'a'.repeat(41),
      '`abcdef1',
      'abcdef1`',
      'abcdef1, 1234567',
      'abcdef1 (checked)',
    ])('rejects malformed North Star commit: %s', (value) => {
      const result = check(withField('North Star commit', `- North Star commit: ${value}`));
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('`- North Star commit:` must be one commit SHA');
    });

    it('rejects a stale North Star commit and names the expected revision', () => {
      const result = check(withField('North Star commit', '- North Star commit: 1234567'));
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain(
        `last commit changing \`.agents/NORTH_STAR.md\` at the PR head is ${NORTH_STAR}`,
      );
    });

    it('passes the PR head to the port and accepts a North Star edit at that head', () => {
      const northStarCommit = jest.fn((_head: string) => HEAD);
      const result = check(withField('North Star commit', `- North Star commit: ${HEAD}`), {
        ...INTENT_PORTS,
        northStarCommit,
      });
      expect(result).toEqual({ ok: true, errors: [] });
      expect(northStarCommit).toHaveBeenCalledWith(HEAD);
    });

    it('checks shape only with a null head and calls neither repository port', () => {
      const noRead = jest.fn(() => {
        throw new Error('repository must not be read');
      });
      const ports = { listPrdFiles: noRead, northStarCommit: noRead };
      const body = withField('PRDs checked', '- PRDs checked: docs/prd/untracked.md');
      expect(check(body, ports, null)).toEqual({ ok: true, errors: [] });
      expect(check(withField('PRDs checked', '- PRDs checked: None'), ports, null).ok).toBe(false);
      expect(
        check(withField('North Star commit', '- North Star commit: None'), ports, null).ok,
      ).toBe(false);
      expect(noRead).not.toHaveBeenCalled();
    });

    it('accepts a reason without requesting a PRD listing', () => {
      const listPrdFiles = jest.fn(() => {
        throw new Error('unused');
      });
      expect(
        check(withField('PRDs checked', '- PRDs checked: None: tooling only'), {
          ...INTENT_PORTS,
          listPrdFiles,
        }),
      ).toEqual({ ok: true, errors: [] });
      expect(listPrdFiles).not.toHaveBeenCalled();
    });

    it('fails closed on missing ports or repository read failures', () => {
      const missing = validatePullRequest({ title: VALID_TITLE, body: VALID_BODY, headSha: HEAD });
      expect(missing.ok).toBe(false);
      expect(missing.errors.join('\n')).toContain('Could not list PRDs');
      expect(missing.errors.join('\n')).toContain('Could not read North Star history');
      const unavailable = () => {
        throw new Error('unavailable');
      };
      const result = check(VALID_BODY, { listPrdFiles: unavailable, northStarCommit: unavailable });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.every((error) => error.includes('unavailable'))).toBe(true);
    });

    it.each([
      '',
      'abcdef1',
      'g'.repeat(40),
    ])('fails closed on invalid North Star history: %s', (value) => {
      const result = check(VALID_BODY, { ...INTENT_PORTS, northStarCommit: () => value });
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('must return a full 40-character SHA');
    });

    it('fails closed on an invalid PRD listing', () => {
      const result = validatePullRequest({
        title: VALID_TITLE,
        body: VALID_BODY,
        headSha: HEAD,
        ...INTENT_PORTS,
        listPrdFiles: () => 'docs/prd/greeting.md',
      });
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('must return an array of paths');
    });
  });

  describe('PRD impact', () => {
    const prdPath = 'docs/prd/greeting.md';
    const routePath = 'apps/web/src/routes/greeting/GreetingPage.tsx';
    const prdCoverage = [{ path: prdPath, patterns: ['apps/web/src/routes/greeting/**'] }];
    const withImpact = (value: string) =>
      VALID_BODY.replace('- PRD impact: None', `- PRD impact: ${value}`);
    const checkImpact = (body = VALID_BODY, changedFiles = [routePath], coverage = prdCoverage) =>
      validatePullRequest({
        ...INTENT_PORTS,
        title: VALID_TITLE,
        body,
        headSha: HEAD,
        changedFiles,
        prdCoverage: coverage,
      });

    it('names the unchanged PRD and both fixes when covered code changes', () => {
      const result = checkImpact();
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(prdPath);
      expect(result.errors[0]).toContain(`Update ${prdPath} in this PR`);
      expect(result.errors[0]).toContain('No behaviour change: <reason>');
    });

    it('passes when the affected PRD changes in the same PR', () => {
      expect(checkImpact(VALID_BODY, [routePath, prdPath])).toEqual({ ok: true, errors: [] });
    });

    it.each([
      'No behaviour change: rename internal variable',
      'No behaviour change: comments only',
      'no behaviour change: unchanged public behaviour',
    ])('passes a sufficient explanation: %s', (value) => {
      expect(checkImpact(withImpact(value))).toEqual({ ok: true, errors: [] });
    });

    it.each([
      '',
      'No behaviour change',
      'No behaviour change:',
      'No behaviour change: refactor',
      'No behaviour change: n/a',
      'No behaviour change:\n- Commands run: pnpm verify',
      'Updated docs/prd/greeting.md',
      'None: tooling only',
    ])('rejects malformed impact even outside covered paths: %s', (value) => {
      const result = checkImpact(withImpact(value), ['scripts/example.mjs']);
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('PRD impact');
    });

    it.each([
      { changedFiles: ['scripts/example.mjs'] },
      { changedFiles: [] },
      { changedFiles: [prdPath] },
    ])('accepts None when no covered code or linked spec changed: %j', ({ changedFiles }) => {
      expect(checkImpact(VALID_BODY, changedFiles)).toEqual({ ok: true, errors: [] });
    });

    it('requires exactly one visible impact field in the real Verification Summary', () => {
      for (const replacement of ['', '<!-- - PRD impact: None -->']) {
        const result = checkImpact(VALID_BODY.replace('- PRD impact: None', replacement));
        expect(result.ok).toBe(false);
        expect(result.errors.join('\n')).toContain('exactly one `- PRD impact:` line; found 0');
      }
      const duplicate = checkImpact(`${VALID_BODY}\n- PRD impact (again): None`);
      expect(duplicate.ok).toBe(false);
      expect(duplicate.errors.join('\n')).toContain('exactly one `- PRD impact:` line; found 2');
      const decoy = VALID_BODY.replace('- PRD impact: None', '').replace(
        '# Behavioural Proof',
        '# Verification Summary\n- PRD impact: None\n\n# Behavioural Proof',
      );
      expect(checkImpact(decoy).errors.join('\n')).toContain(
        'exactly one `- PRD impact:` line; found 0',
      );
    });

    it.each(['updated', 'explained'])('requires an affected PRD in PRDs checked when %s', (fix) => {
      const body = (
        fix === 'explained' ? withImpact('No behaviour change: comments only') : VALID_BODY
      ).replace('- PRDs checked: docs/prd/greeting.md', '- PRDs checked: None: tooling only');
      const changedFiles = fix === 'updated' ? [routePath, prdPath] : [routePath];
      const result = checkImpact(body, changedFiles);
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(prdPath);
      expect(result.errors[0]).toContain('PRDs checked');
    });

    it('does not confuse a similarly named checked PRD with the affected PRD', () => {
      const body = withImpact('No behaviour change: comments only').replace(
        '- PRDs checked: docs/prd/greeting.md',
        '- PRDs checked: docs/prd/todo.md',
      );
      expect(checkImpact(body).errors.join('\n')).toContain(prdPath);
    });

    it('matches linked specs through the shared PRD parser even outside Covers globs', () => {
      const parsed = parseBehaviours(
        prdPath,
        [
          '# Greeting',
          '- **Covers:** `apps/web/src/routes/greeting/**`',
          '## Behaviours',
          '- Greets a name.',
          '  - Proved by [greets a name](../../apps/web/e2e/greeting.spec.ts#L10)',
        ].join('\n'),
      );
      const coverage = [{ path: prdPath, patterns: coveredPaths(parsed) }];
      const result = checkImpact(VALID_BODY, ['apps/web/e2e/greeting.spec.ts'], coverage);
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain(prdPath);
      expect(checkImpact(VALID_BODY, ['apps/web/e2e/greeting.spec.ts', prdPath], coverage)).toEqual(
        {
          ok: true,
          errors: [],
        },
      );
    });

    it('uses native glob semantics for alternatives and zero nested folders', () => {
      const coverage = [
        { path: prdPath, patterns: ['{apps,showcase/*}/web/src/**/GreetingPage.tsx'] },
      ];
      const result = checkImpact(VALID_BODY, ['apps/web/src/GreetingPage.tsx'], coverage);
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain(prdPath);
    });

    it('requires a fix for each affected PRD and accepts a mixture of updated and explained PRDs', () => {
      const todoPath = 'docs/prd/todo.md';
      const coverage = [...prdCoverage, { path: todoPath, patterns: ['apps/web/src/routes/**'] }];
      const body = VALID_BODY.replace(
        '- PRDs checked: docs/prd/greeting.md',
        '- PRDs checked: `docs/prd/greeting.md`, `docs/prd/todo.md`',
      );
      const result = checkImpact(body, [routePath, prdPath], coverage);
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(todoPath);
      expect(checkImpact(body, [routePath, prdPath, todoPath], coverage)).toEqual({
        ok: true,
        errors: [],
      });
      expect(
        checkImpact(
          body.replace('- PRD impact: None', '- PRD impact: No behaviour change: comments only'),
          [routePath, prdPath],
          coverage,
        ),
      ).toEqual({ ok: true, errors: [] });
    });

    it.each([
      { changedFiles: undefined, prdCoverage },
      { changedFiles: routePath, prdCoverage },
      { changedFiles: [''], prdCoverage },
      { changedFiles: [42], prdCoverage },
      { changedFiles: [routePath], prdCoverage: undefined },
      { changedFiles: [routePath], prdCoverage: [null] },
      { changedFiles: [routePath], prdCoverage: [{ path: prdPath, patterns: 'apps/**' }] },
      { changedFiles: [routePath], prdCoverage: [{ patterns: ['apps/**'] }] },
    ])('fails closed on invalid impact evidence: %j', (evidence) => {
      const result = validatePullRequest({
        ...INTENT_PORTS,
        title: VALID_TITLE,
        body: VALID_BODY,
        headSha: HEAD,
        ...evidence,
      });
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('Could not check PRD impact');
    });

    it('checks only impact shape with a null head and no repository evidence', () => {
      const options = {
        title: VALID_TITLE,
        body: VALID_BODY,
        headSha: null,
      };
      expect(validatePullRequest(options)).toEqual({ ok: true, errors: [] });
      expect(
        validatePullRequest({ ...options, body: withImpact('No behaviour change: refactor') }).ok,
      ).toBe(false);
    });
  });

  describe('inline images', () => {
    const IMAGE = /!\[the counter at capacity\].*\)/;
    const withProof = (proof: string) => VALID_BODY.replace(IMAGE, proof);
    const errorsFor = (body: string) =>
      validatePullRequest({ ...INTENT_PORTS, headSha: HEAD, title: VALID_TITLE, body }).errors;

    it.each([
      'docs/proof/x/at-capacity.png',
      './docs/proof/x/at-capacity.png',
      '/docs/proof/x/at-capacity.png',
      'file:///Users/me/at-capacity.png',
      '/Users/me/Desktop/at-capacity.png',
      'C:\\Users\\me\\at-capacity.png',
      'http://example.com/at-capacity.png',
    ])('fails an image at %s, naming the docs/proof fix', (url) => {
      const errors = errorsFor(withProof(`![at capacity](${url})`)).filter((error) =>
        error.startsWith('Image '),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(url);
      expect(errors[0]).toContain('docs/proof/<scope>/');
      expect(errors[0]).toContain('?raw=1');
    });

    it('checks images in every section, not only the proof section', () => {
      const body = VALID_BODY.replace(
        '- Added a machine validator for the PR body.',
        '![diagram](./diagram.png)',
      );
      expect(errorsFor(body).join('\n')).toContain('./diagram.png');
    });

    it('ignores images inside HTML comments and fenced code', () => {
      const body = withProof(
        [
          '![at capacity](https://github.com/o/r/blob/b/docs/proof/x/a.png?raw=1)',
          '<!-- ![example](./local.png) -->',
          '```md',
          '![example](./local.png)',
          '```',
        ].join('\n'),
      );
      expect(errorsFor(body)).toEqual([]);
    });

    it('fails a GitHub blob image without ?raw=1, naming the fix', () => {
      const errors = errorsFor(
        withProof('![at capacity](https://github.com/o/r/blob/b/docs/proof/x/a.png)'),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('?raw=1');
      expect(errors[0]).toContain('https://github.com/o/r/blob/b/docs/proof/x/a.png');
    });

    it('passes non-blob https images such as user attachments', () => {
      const body = withProof(
        '![at capacity](https://github.com/user-attachments/assets/0f1e2d3c-aaaa-bbbb)',
      );
      expect(errorsFor(body)).toEqual([]);
    });

    it.each([
      '[screenshot](https://github.com/o/r/blob/b/docs/proof/x/a.png?raw=1)',
      '[screenshot](https://example.com/a.JPG)',
      '[screenshot](https://example.com/a.webp?v=2)',
    ])('fails a plain link to an image in the proof section: %s', (link) => {
      const errors = errorsFor(withProof(`Not applicable: see the screenshot ${link}`));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('embed it inline with `![alt](url)`');
    });

    it('passes a plain link to a non-image in the proof section', () => {
      const body = withProof(
        '![at capacity](https://github.com/o/r/blob/b/docs/proof/x/a.png?raw=1)\n' +
          '[the E2E spec](https://github.com/o/r/blob/b/e2e/app.spec.ts)',
      );
      expect(errorsFor(body)).toEqual([]);
    });

    it('passes an image wrapped in a link to the full-size file', () => {
      const url = 'https://github.com/o/r/blob/b/docs/proof/x/a.png?raw=1';
      expect(errorsFor(withProof(`[![at capacity](${url})](${url})`))).toEqual([]);
    });
  });

  describe('Not applicable proof', () => {
    const withProof = (proof: string) =>
      VALID_BODY.replace(/!\[the counter at capacity\].*\)/, proof);

    it.each([
      'Not applicable',
      '- Not applicable.',
      'Not applicable: n/a',
    ])('fails "%s" without a reason on the same line', (line) => {
      const result = validatePullRequest({
        ...INTENT_PORTS,
        headSha: HEAD,
        title: VALID_TITLE,
        body: withProof(line),
      });
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('Not applicable: docs-only change');
    });

    it('passes a reason on the next non-empty line', () => {
      const body = withProof('Not applicable.\n\nThis is a docs-only change.');
      expect(
        validatePullRequest({ ...INTENT_PORTS, headSha: HEAD, title: VALID_TITLE, body }),
      ).toEqual({
        ok: true,
        errors: [],
      });
    });

    it.each([
      'Not applicable: docs-only change.',
      'Not applicable — CI-only change',
      'Not Applicable: docs-only change.',
    ])('passes %j', (line) => {
      const body = withProof(line);
      expect(
        validatePullRequest({ ...INTENT_PORTS, headSha: HEAD, title: VALID_TITLE, body }),
      ).toEqual({
        ok: true,
        errors: [],
      });
    });

    it.each([
      '![screenshot]()',
      'Proof format: `![alt](https://example.com/a.png)`',
    ])('treats %j as no proof', (line) => {
      const body = withProof(line);
      expect(
        validatePullRequest({ ...INTENT_PORTS, headSha: HEAD, title: VALID_TITLE, body }).ok,
      ).toBe(false);
    });

    it('accepts ?raw=true on a GitHub blob image', () => {
      const body = withProof(
        '![s](https://github.com/o/r/blob/feat/x/docs/proof/a/s.png?raw=true)',
      );
      expect(
        validatePullRequest({ ...INTENT_PORTS, headSha: HEAD, title: VALID_TITLE, body }),
      ).toEqual({
        ok: true,
        errors: [],
      });
    });

    it('passes a reason on the same line', () => {
      const body = withProof('Not applicable: docs-only change, no rendered surface.');
      expect(
        validatePullRequest({ ...INTENT_PORTS, headSha: HEAD, title: VALID_TITLE, body }),
      ).toEqual({
        ok: true,
        errors: [],
      });
    });

    it('does not require a reason when the proof section has an inline image', () => {
      const body = VALID_BODY.replace(
        '# Verification Summary',
        'Video: Not applicable\n\n# Verification Summary',
      );
      expect(
        validatePullRequest({ ...INTENT_PORTS, headSha: HEAD, title: VALID_TITLE, body }),
      ).toEqual({
        ok: true,
        errors: [],
      });
    });
  });

  describe('branch name', () => {
    it.each([
      'feat/threshold-reset',
      'ci/pr-process-checks',
      'chore/bump-actions',
      'fix/a1',
      'feat/vite-7.1',
      'feat/scope/thing',
      'revert-12-feat/threshold-reset',
    ])('passes %s', (branch) => {
      expect(
        validatePullRequest({
          ...INTENT_PORTS,
          headSha: HEAD,
          title: VALID_TITLE,
          body: VALID_BODY,
          branch,
        }),
      ).toEqual({
        ok: true,
        errors: [],
      });
    });

    it.each([
      'my-branch',
      'feature/threshold-reset',
      'feat/Threshold-Reset',
      'feat/threshold_reset',
      'feat/threshold--reset',
      'feat/',
      'claude/threshold-reset',
    ])('fails %s with an example', (branch) => {
      const result = validatePullRequest({
        ...INTENT_PORTS,
        headSha: HEAD,
        title: VALID_TITLE,
        body: VALID_BODY,
        branch,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(`"${branch}"`);
      expect(result.errors[0]).toContain('feat/threshold-reset');
    });

    it('does not check the branch when none is given', () => {
      expect(
        validatePullRequest({
          ...INTENT_PORTS,
          headSha: HEAD,
          title: VALID_TITLE,
          body: VALID_BODY,
          branch: '',
        }).ok,
      ).toBe(true);
      expect(
        validatePullRequest({
          ...INTENT_PORTS,
          headSha: HEAD,
          title: VALID_TITLE,
          body: VALID_BODY,
        }).ok,
      ).toBe(true);
    });

    it('accepts every Conventional Commit type in both the title and the branch', () => {
      for (const type of CONVENTIONAL_COMMIT_TYPES) {
        const result = validatePullRequest({
          ...INTENT_PORTS,
          headSha: HEAD,
          title: `${type}: do the thing`,
          body: VALID_BODY,
          branch: `${type}/do-the-thing`,
        });
        expect(result).toEqual({ ok: true, errors: [] });
      }
    });
  });

  describe('machine-local paths', () => {
    const readFixture = (name: string) =>
      readFileSync(resolve(import.meta.dirname, 'fixtures/pr-bodies', name), 'utf8');

    it('fails the #11 body, which ran a validator from a /Users home folder', () => {
      const fixture = readFixture('pr-11.md');
      const body = `${VALID_BODY}\n\n${fixture}`;
      const result = validatePullRequest({
        ...INTENT_PORTS,
        title: VALID_TITLE,
        body,
        headSha: HEAD,
      });
      const path = '/Users/agents/.codex/skills/.system/skill-creator/scripts/quick_validate.py';
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(JSON.stringify(`${path.slice(0, 40)}…`));
    });

    it('fails the #58 body, which cited /tmp/lhproof/classify.sh as proof', () => {
      const fixture = readFixture('pr-58.md');
      const body = `${VALID_BODY}\n\n${fixture}`;
      const result = validatePullRequest({
        ...INTENT_PORTS,
        title: VALID_TITLE,
        body,
        headSha: HEAD,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('"/tmp/lhproof/classify.sh"');
    });

    it('fails the #92 body, which published /workspace/mono scratch paths in a fenced block', () => {
      const fixture = readFixture('pr-92.md');
      const body = `${VALID_BODY}\n\n${fixture}`;
      const result = validatePullRequest({
        ...INTENT_PORTS,
        title: VALID_TITLE,
        body,
        headSha: HEAD,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(4);
    });

    const resultFor = (extra: string) =>
      validatePullRequest({
        ...INTENT_PORTS,
        title: VALID_TITLE,
        body: `${VALID_BODY}\n\n${extra}`,
        headSha: HEAD,
      });
    const pathErrors = (extra: string) =>
      resultFor(extra).errors.filter((error) => error.includes('machine-local path'));

    const urlCases: string[] = [];
    for (const scheme of ['http', 'https']) {
      for (const wrap of [
        (s: string) => s,
        (s: string) => `[link](${s})`,
        (s: string) => `<${s}>`,
      ]) {
        for (const part of ['/home/box/x', '/tmp/run/x', '/workspace/x']) {
          for (const suffix of [part, `?next=${part}`, `#${part}`]) {
            urlCases.push(wrap(`${scheme}://example.com/${suffix}`));
          }
        }
      }
    }
    it.each([
      ...urlCases,
      'https://example.com:/tmp/local',
      'https://example.com/view?next=/home/box/a&log=/tmp/run/a',
      '[log](https://example.com/run?path=/workspace/x/y.log)',
      '<https://example.com/a?u=/Users/ben/x>',
      'http://example.com/?f=/root/x',
    ])('passes an http(s) URL whole, query and fragment values included: %s', (text) => {
      expect(resultFor(text)).toEqual({ ok: true, errors: [] });
    });

    it.each([
      ['https://example.com /tmp/local', '/tmp/local'],
      ['https://example.com`/tmp/local`', '/tmp/local'],
      ['https://example.com(/tmp/local)', '/tmp/local'],
      ['https://example.com</tmp/local>', '/tmp/local'],
      ['see https://example.com/?next=/tmp/a and /tmp/run/b.log', '/tmp/run/b.log'],
    ])('reports a local path that follows a URL on the same line: %s', (text, expectedPath) => {
      const errors = pathErrors(text);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(JSON.stringify(expectedPath));
    });

    const embeddedSchemeCases = [
      '/Users/ben/',
      '/home/box/',
      '/root/',
      '/workspace/',
      '/tmp/run/',
      '/private/var/',
      '/var/folders/',
      'C:\\Users\\ben\\',
      'file:///home/box/',
    ].flatMap((prefix) =>
      ['x:', 'x=', ''].map((joiner) => `${prefix}${joiner}https://example.com/x`),
    );
    it.each([
      ...new Set([
        '/home/box:https://example.com/x',
        '/Users/ben=https://example.com/x',
        '/home/box/dir:https://example.com/x',
        '/tmp/x:https://example.com/x',
        '/tmp/https://example.com',
        '/tmp/http://example.com',
        '/home/box/https://example.com',
        '/workspace/https://example.com',
        ...embeddedSchemeCases,
      ]),
    ])('reports a local path whole when it holds a URL-shaped segment: %s', (text) => {
      const errors = pathErrors(text);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text),
      );
    });

    it.each([
      [
        '- [x] `python3 /Users/agents/.codex/skills/.system/skill-creator/scripts/quick_validate.py .claude/skills/build-quality-gates`',
        '/Users/agents/.codex/skills/.system/skill-creator/scripts/quick_validate.py',
      ],
      [
        '- Path classification: /tmp/lhproof/classify.sh extracts the detection step',
        '/tmp/lhproof/classify.sh',
      ],
      [
        '```json\n{ "workdir": "/workspace/mono/scratch/pr4-fix2/trials-dry/todo-01-x" }\n```',
        '/workspace/mono/scratch/pr4-fix2/trials-dry/todo-01-x',
      ],
      ['![shot](file:///home/box/out/shot.png)', 'file:///home/box/out/shot.png'],
      ['`C:\\Users\\ben\\proof.png`', 'C:\\Users\\ben\\proof.png'],
    ])('fails a machine-local path in %s', (extra, path) => {
      const errors = pathErrors(extra);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('machine-local path');
      expect(errors[0]).toContain(
        JSON.stringify(path.length > 40 ? `${path.slice(0, 40)}…` : path),
      );
    });

    it.each([
      '`pnpm verify` passed; logs in `<tmp>/verify.log`',
      '![greeting](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/blob/feat/x/docs/proof/greeting/a.png?raw=1)',
      "bubblewrap mounts the trial's temp folder over `/tmp`",
      '`apps/web/src/routes/greeting/GreetingPage.tsx`',
      '`node scripts/enforcement-approval.mjs --git origin/main HEAD`',
    ])('passes published reference %s', (extra) => {
      expect(resultFor(extra)).toEqual({ ok: true, errors: [] });
    });

    it('reports the exact message with a shortened path and its raw line number', () => {
      const path = '/workspace/mono/scratch/pr4-fix2/trials-dry/todo-01.json';
      const line = `Output: ${path}`;
      const body = `${VALID_BODY}\n\n${line}`;
      const lineNumber = body.split('\n').indexOf(line) + 1;
      expect(
        validatePullRequest({ ...INTENT_PORTS, title: VALID_TITLE, body, headSha: HEAD }).errors,
      ).toEqual([
        `PR body names the machine-local path "${path.slice(0, 40)}…" (line ${lineNumber}). ` +
          'Name a repo-relative path (`docs/proof/<scope>/file.png`), a placeholder such as `<workdir>/repo`, or the command a reviewer can run to reproduce it.',
      ]);
    });

    it('deduplicates paths and keeps the line of the first occurrence', () => {
      const errors = pathErrors('/tmp/run/a.log.\n/tmp/run/a.log\n/root/b.log');
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain(`"/tmp/run/a.log" (line ${VALID_BODY.split('\n').length + 2})`);
      expect(errors[1]).toContain('"/root/b.log"');
    });

    it('scans inline code, fenced blocks and HTML comments', () => {
      const errors = pathErrors(
        '`/tmp/inline`\n```text\n/workspace/fenced\n```\n<!-- /home/box/comment -->',
      );
      expect(errors).toHaveLength(3);
      for (const path of ['/tmp/inline', '/workspace/fenced', '/home/box/comment']) {
        expect(errors.some((error) => error.includes(JSON.stringify(path)))).toBe(true);
      }
    });

    it.each([
      'https://github.com/o/r/blob/feat/x/docs/proof/home/a.png?raw=1',
      'docs/tmp/x.md',
      './tmp/x',
      'see /tmp for scratch',
      'foo/workspace/x',
      'a.Users/x/y',
      '/tmp/',
      '/Users/box',
      '/home/box',
      '/TMP/run',
    ])('passes a non-path boundary or prefix in %s', (extra) => {
      expect(resultFor(extra)).toEqual({ ok: true, errors: [] });
    });

    it.each([
      ['--out=/tmp/run/x.log', '/tmp/run/x.log'],
      ['"dir":"/root/.cache/x"', '/root/.cache/x'],
      ['(/var/folders/ab/c)', '/var/folders/ab/c'],
      ['</private/var/x>', '/private/var/x'],
      ['[/home/box/a]', '/home/box/a'],
      ['see /tmp/x/run.log.', '/tmp/x/run.log'],
    ])('recognizes a path boundary and trims punctuation in %s', (extra, path) => {
      const errors = pathErrors(extra);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(JSON.stringify(path));
    });

    it('passes a home shorthand', () => {
      expect(resultFor('`~/.codex/config.toml`')).toEqual({ ok: true, errors: [] });
    });
  });

  it('ignores an image example quoted in inline code', () => {
    const result = validatePullRequest({
      ...INTENT_PORTS,
      headSha: HEAD,
      title: VALID_TITLE,
      body: `${VALID_BODY}\n\n# Notes\n\n- Embed proof as \`![alt](...png?raw=1)\`.`,
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('exposes the four required sections in order', () => {
    expect(REQUIRED_SECTIONS).toEqual([
      'Why does this feature exist?',
      'What changed?',
      'Behavioural Proof (with video and screenshots)',
      'Verification Summary',
    ]);
  });
});

describe('resolveHeadSha', () => {
  const noGit = () => {
    throw new Error('git must not be read');
  };

  it('uses PR_HEAD_SHA when it is a full SHA', () => {
    expect(resolveHeadSha({ PR_HEAD_SHA: HEAD, GITHUB_ACTIONS: 'true' }, noGit)).toBe(HEAD);
  });

  it('fails instead of falling back when PR_HEAD_SHA is empty or malformed', () => {
    for (const value of ['', '0a21f68', 'not-a-sha']) {
      expect(() => resolveHeadSha({ PR_HEAD_SHA: value }, noGit)).toThrow(
        'PR_HEAD_SHA must be the 40-character PR head SHA',
      );
    }
  });

  it('fails in GitHub Actions without PR_HEAD_SHA, because the checkout is a merge commit', () => {
    expect(() => resolveHeadSha({ GITHUB_ACTIONS: 'true' }, noGit)).toThrow(
      'PR_HEAD_SHA must be the 40-character PR head SHA, got "".',
    );
  });

  it('falls back to the local git HEAD when run by hand', () => {
    expect(resolveHeadSha({}, () => HEAD)).toBe(HEAD);
  });
});

describe('resolveBaseSha', () => {
  it('uses the raw PR_BASE_SHA in GitHub Actions', () => {
    expect(resolveBaseSha({ PR_BASE_SHA: HEAD, GITHUB_ACTIONS: 'true' })).toBe(HEAD);
  });

  it('uses an explicit base SHA locally', () => {
    expect(resolveBaseSha({ PR_BASE_SHA: HEAD })).toBe(HEAD);
  });

  it.each([
    '',
    '0a21f68',
    'g'.repeat(40),
    'a'.repeat(41),
    JSON.stringify(HEAD),
    'origin/main',
  ])('rejects malformed or JSON-encoded PR_BASE_SHA: %s', (value) => {
    expect(() => resolveBaseSha({ PR_BASE_SHA: value })).toThrow(
      'PR_BASE_SHA must be the 40-character PR base SHA',
    );
  });

  it('fails closed when CI omits PR_BASE_SHA', () => {
    expect(() => resolveBaseSha({ GITHUB_ACTIONS: 'true' })).toThrow(
      'PR_BASE_SHA must be the 40-character PR base SHA',
    );
  });

  it('defaults to origin/main for a local comparison', () => {
    expect(resolveBaseSha({})).toBe('origin/main');
  });
});

describe('readChangedFiles', () => {
  let directory: string;
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const coveredPath = 'apps/web/src/routes/greeting/renamed\npage.tsx';
  const uncoveredPath = 'scripts/renamed page.tsx';

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: directory, env, encoding: 'utf8' }).trim();
  const commit = (message: string) =>
    git(
      '-c',
      'user.name=Ben Sheridan-Edwards',
      '-c',
      'user.email=bensheridanedwards@gmail.com',
      'commit',
      '-q',
      '-m',
      message,
    );

  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  const prepareHead = () => {
    write('.agents/NORTH_STAR.md', '# Software factory\n');
    write('docs/prd/greeting.md', '# Greeting\n- **Covers:** `apps/web/src/routes/greeting/**`\n');
    write(coveredPath, 'export const message = "hello";\n');
    git('add', '-A');
    commit('test: create base');
    const base = git('rev-parse', 'HEAD');
    write(coveredPath, 'export const message = "welcome";\n');
    git('add', '-A');
    commit('test: change covered behaviour');
    return { base, head: git('rev-parse', 'HEAD') };
  };
  const runCli = (base: string, head: string, body = VALID_BODY) => {
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, 'validate-pr-body.mjs')],
      {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...env,
          GITHUB_ACTIONS: 'true',
          PR_BASE_SHA: base,
          PR_HEAD_SHA: head,
          PR_TITLE: VALID_TITLE,
          PR_BODY: body.replace('0a21f68', head).replace('abcdef1', base),
        },
      },
    );
    return { status: result.status, output: result.stdout + result.stderr };
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'prd-impact-'));
    git('init', '-q', '-b', 'main');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    { source: coveredPath, destination: uncoveredPath },
    { source: uncoveredPath, destination: coveredPath },
  ])('retains both rename paths and their whitespace: $source → $destination', ({
    source,
    destination,
  }) => {
    mkdirSync(dirname(join(directory, source)), { recursive: true });
    writeFileSync(join(directory, source), 'export const message = "hello";\n');
    git('add', '-A');
    commit('test: add source');
    const base = git('rev-parse', 'HEAD');
    mkdirSync(dirname(join(directory, destination)), { recursive: true });
    renameSync(join(directory, source), join(directory, destination));
    git('add', '-A');
    commit('test: rename source');
    const changedFiles = readChangedFiles(base, git('rev-parse', 'HEAD'), directory);
    expect(changedFiles.sort()).toEqual([source, destination].sort());
    const result = validatePullRequest({
      ...INTENT_PORTS,
      title: VALID_TITLE,
      body: VALID_BODY,
      headSha: HEAD,
      changedFiles,
      prdCoverage: [
        { path: 'docs/prd/greeting.md', patterns: ['apps/web/src/routes/greeting/**'] },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('docs/prd/greeting.md');
  });

  it('CLI reads coverage at the event head despite a different checkout and dirty PRD', () => {
    const { base, head } = prepareHead();
    write('docs/prd/greeting.md', '# Greeting\n- **Covers:** `scripts/**`\n');
    git('add', '-A');
    commit('test: change checkout coverage');
    write('docs/prd/greeting.md', '# Invalid dirty PRD\n');
    const rejected = runCli(base, head);
    expect(rejected.status).toBe(1);
    expect(rejected.output).toContain('docs/prd/greeting.md, but that PRD is unchanged');
    const accepted = runCli(
      base,
      head,
      VALID_BODY.replace('- PRD impact: None', '- PRD impact: No behaviour change: comments only'),
    );
    expect(accepted.status).toBe(0);
    expect(accepted.output).toContain('satisfy the quality contract');
  });

  it('CLI fails closed when coverage at the PR head is malformed', () => {
    const { base } = prepareHead();
    write('docs/prd/greeting.md', '# Greeting without coverage\n');
    git('add', '-A');
    commit('test: remove coverage declaration');
    const result = runCli(base, git('rev-parse', 'HEAD'));
    expect(result.status).toBe(1);
    expect(result.output).toContain('docs/prd/greeting.md has no `Covers` line');
  });

  it('CLI fails closed when the base commit is unavailable', () => {
    const { head } = prepareHead();
    const result = runCli('f'.repeat(40), head);
    expect(result.status).toBe(1);
    expect(result.output).toContain('PR quality contract failed');
    expect(result.output).toContain('git diff');
  });
});
