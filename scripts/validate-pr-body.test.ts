import {
  CONVENTIONAL_COMMIT_TYPES,
  REQUIRED_SECTIONS,
  validatePullRequest,
} from './validate-pr-body.mjs';

// A body that satisfies every rule: all four sections in order, each with real
// content, and inline-image proof.
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
  '- Commands run: `pnpm verify`, `pnpm e2e`.',
  '- Results: all green.',
].join('\n');

const VALID_TITLE = 'feat(pr-quality): validate PR bodies in CI';

describe('validatePullRequest', () => {
  it('passes a well-formed body and title', () => {
    const result = validatePullRequest({ title: VALID_TITLE, body: VALID_BODY });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('fails when a required section is missing', () => {
    const withoutVerification = VALID_BODY.replace(/# Verification Summary[\s\S]*$/, '');
    const result = validatePullRequest({
      title: VALID_TITLE,
      body: withoutVerification,
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
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('placeholder-only');
  });

  it('fails when the proof section has neither an image nor "Not applicable"', () => {
    const noProof = VALID_BODY.replace(
      /!\[the counter at capacity\].*\)/,
      'The build passed, so this is fine.',
    );
    const result = validatePullRequest({ title: VALID_TITLE, body: noProof });
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
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('no proof');
  });

  it('fails a non-Conventional-Commits title', () => {
    const result = validatePullRequest({
      title: '[claude] add PR validator',
      body: VALID_BODY,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Conventional Commits');
  });

  describe('inline images', () => {
    const IMAGE = /!\[the counter at capacity\].*\)/;
    const withProof = (proof: string) => VALID_BODY.replace(IMAGE, proof);
    const errorsFor = (body: string) => validatePullRequest({ title: VALID_TITLE, body }).errors;

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
      const result = validatePullRequest({ title: VALID_TITLE, body: withProof(line) });
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('Not applicable: docs-only change');
    });

    it('passes a reason on the next non-empty line', () => {
      const body = withProof('Not applicable.\n\nThis is a docs-only change.');
      expect(validatePullRequest({ title: VALID_TITLE, body })).toEqual({ ok: true, errors: [] });
    });

    it.each([
      'Not applicable: docs-only change.',
      'Not applicable — CI-only change',
      'Not Applicable: docs-only change.',
    ])('passes %j', (line) => {
      const body = withProof(line);
      expect(validatePullRequest({ title: VALID_TITLE, body })).toEqual({ ok: true, errors: [] });
    });

    it.each([
      '![screenshot]()',
      'Proof format: `![alt](https://example.com/a.png)`',
    ])('treats %j as no proof', (line) => {
      const body = withProof(line);
      expect(validatePullRequest({ title: VALID_TITLE, body }).ok).toBe(false);
    });

    it('accepts ?raw=true on a GitHub blob image', () => {
      const body = withProof(
        '![s](https://github.com/o/r/blob/feat/x/docs/proof/a/s.png?raw=true)',
      );
      expect(validatePullRequest({ title: VALID_TITLE, body })).toEqual({ ok: true, errors: [] });
    });

    it('passes a reason on the same line', () => {
      const body = withProof('Not applicable: docs-only change, no rendered surface.');
      expect(validatePullRequest({ title: VALID_TITLE, body })).toEqual({ ok: true, errors: [] });
    });

    it('does not require a reason when the proof section has an inline image', () => {
      const body = VALID_BODY.replace(
        '# Verification Summary',
        'Video: Not applicable\n\n# Verification Summary',
      );
      expect(validatePullRequest({ title: VALID_TITLE, body })).toEqual({ ok: true, errors: [] });
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
      expect(validatePullRequest({ title: VALID_TITLE, body: VALID_BODY, branch })).toEqual({
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
      const result = validatePullRequest({ title: VALID_TITLE, body: VALID_BODY, branch });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(`"${branch}"`);
      expect(result.errors[0]).toContain('feat/threshold-reset');
    });

    it('does not check the branch when none is given', () => {
      expect(validatePullRequest({ title: VALID_TITLE, body: VALID_BODY, branch: '' }).ok).toBe(
        true,
      );
      expect(validatePullRequest({ title: VALID_TITLE, body: VALID_BODY }).ok).toBe(true);
    });

    it('accepts every Conventional Commit type in both the title and the branch', () => {
      for (const type of CONVENTIONAL_COMMIT_TYPES) {
        const result = validatePullRequest({
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
