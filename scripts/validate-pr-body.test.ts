import {
  CONVENTIONAL_COMMIT_TYPES,
  REQUIRED_SECTIONS,
  resolveHeadSha,
  validatePullRequest,
} from './validate-pr-body.mjs';

// The PR head every body below is checked against.
const HEAD = '0a21f68d4a57e7998b1357444f2bdad00cea6528';

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
  '- Commands run: `pnpm verify`, `pnpm e2e`.',
  '- Results: all green.',
].join('\n');

const VALID_TITLE = 'feat(pr-quality): validate PR bodies in CI';

describe('validatePullRequest', () => {
  it('passes a well-formed body and title', () => {
    const result = validatePullRequest({ title: VALID_TITLE, body: VALID_BODY, headSha: HEAD });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('fails when a required section is missing', () => {
    const withoutVerification = VALID_BODY.replace(/# Verification Summary[\s\S]*$/, '');
    const result = validatePullRequest({
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
    const result = validatePullRequest({ title: VALID_TITLE, body: noProof, headSha: HEAD });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('no proof');
  });

  it('accepts "Not applicable" as proof for non-UI changes', () => {
    const notApplicable = VALID_BODY.replace(
      /!\[the counter at capacity\].*\)/,
      'Not applicable — no rendered UI surface changed.',
    );
    const result = validatePullRequest({
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
      title: VALID_TITLE,
      body: overlappingComment,
      headSha: HEAD,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('no proof');
  });

  it('fails a non-Conventional-Commits title', () => {
    const result = validatePullRequest({
      title: '[claude] add PR validator',
      body: VALID_BODY,
      headSha: HEAD,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Conventional Commits');
  });

  const withHeadCommit = (field: string) => VALID_BODY.replace('- Head commit: 0a21f68', field);
  const headErrors = (field: string, headSha: string | null) =>
    validatePullRequest({ title: VALID_TITLE, body: withHeadCommit(field), headSha }).errors;

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
    const result = validatePullRequest({ title: VALID_TITLE, body: decoy, headSha: HEAD });
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
      const result = validatePullRequest({ title: VALID_TITLE, body: VALID_BODY, headSha });
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain(
        'headSha must be the 40-character PR head SHA or null',
      );
    }
  });

  describe('inline images', () => {
    const IMAGE = /!\[the counter at capacity\].*\)/;
    const withProof = (proof: string) => VALID_BODY.replace(IMAGE, proof);
    const errorsFor = (body: string) =>
      validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body }).errors;

    it.each([
      'docs/proof/x/at-capacity.png',
      './docs/proof/x/at-capacity.png',
      '/docs/proof/x/at-capacity.png',
      'file:///Users/me/at-capacity.png',
      '/Users/me/Desktop/at-capacity.png',
      'C:\\Users\\me\\at-capacity.png',
      'http://example.com/at-capacity.png',
    ])('fails an image at %s, naming the docs/proof fix', (url) => {
      const errors = errorsFor(withProof(`![at capacity](${url})`));
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
        headSha: HEAD,
        title: VALID_TITLE,
        body: withProof(line),
      });
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('Not applicable: docs-only change');
    });

    it('passes a reason on the next non-empty line', () => {
      const body = withProof('Not applicable.\n\nThis is a docs-only change.');
      expect(validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body })).toEqual({
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
      expect(validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body })).toEqual({
        ok: true,
        errors: [],
      });
    });

    it.each([
      '![screenshot]()',
      'Proof format: `![alt](https://example.com/a.png)`',
    ])('treats %j as no proof', (line) => {
      const body = withProof(line);
      expect(validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body }).ok).toBe(false);
    });

    it('accepts ?raw=true on a GitHub blob image', () => {
      const body = withProof(
        '![s](https://github.com/o/r/blob/feat/x/docs/proof/a/s.png?raw=true)',
      );
      expect(validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body })).toEqual({
        ok: true,
        errors: [],
      });
    });

    it('passes a reason on the same line', () => {
      const body = withProof('Not applicable: docs-only change, no rendered surface.');
      expect(validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body })).toEqual({
        ok: true,
        errors: [],
      });
    });

    it('does not require a reason when the proof section has an inline image', () => {
      const body = VALID_BODY.replace(
        '# Verification Summary',
        'Video: Not applicable\n\n# Verification Summary',
      );
      expect(validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body })).toEqual({
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
        validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body: VALID_BODY, branch }),
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
        validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body: VALID_BODY, branch: '' }).ok,
      ).toBe(true);
      expect(validatePullRequest({ headSha: HEAD, title: VALID_TITLE, body: VALID_BODY }).ok).toBe(
        true,
      );
    });

    it('accepts every Conventional Commit type in both the title and the branch', () => {
      for (const type of CONVENTIONAL_COMMIT_TYPES) {
        const result = validatePullRequest({
          headSha: HEAD,
          title: `${type}: do the thing`,
          body: VALID_BODY,
          branch: `${type}/do-the-thing`,
        });
        expect(result).toEqual({ ok: true, errors: [] });
      }
    });
  });

  it('ignores an image example quoted in inline code', () => {
    const result = validatePullRequest({
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
