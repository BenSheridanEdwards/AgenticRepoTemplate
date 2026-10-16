import { REQUIRED_SECTIONS, resolveHeadSha, validatePullRequest } from './validate-pr-body.mjs';

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
