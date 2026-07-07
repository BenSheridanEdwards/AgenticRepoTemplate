#!/usr/bin/env node
/**
 * Validate a pull-request body and title against the repo's PR contract.
 *
 * The body and title arrive through environment variables (`PR_BODY`,
 * `PR_TITLE`) rather than as command arguments or interpolated workflow text, so
 * an attacker-controlled PR body can never be evaluated as shell or YAML. The
 * workflow populates them with `${{ toJSON(github.event.pull_request.body) }}`,
 * so each env var holds a JSON-encoded string (quoted, with escaped newlines);
 * the CLI runner JSON-parses it back to the raw text. See
 * `.github/workflows/pr-quality.yml`.
 *
 * This module exports `validatePullRequest` for unit tests and runs the CLI when
 * invoked directly. The CLI exits non-zero (fail-closed) with actionable errors.
 */

/**
 * The four template sections, in the order the contract requires them.
 * `.github/pull_request_template.md` and
 * `.agents/project/DEFINITION_OF_DONE.md` are the source of truth for this list.
 */
export const REQUIRED_SECTIONS = [
  'Why does this feature exist?',
  'What changed?',
  'Behavioural Proof (with video and screenshots)',
  'Verification Summary',
];

/** The proof section must contain one of these, or the PR fails. */
const INLINE_IMAGE_MARKER = '![';
const NOT_APPLICABLE_MARKER = 'Not applicable';

/**
 * Conventional Commits: `type(scope): summary` or `type: summary`. The scope is
 * optional; an optional `!` marks a breaking change. The type set matches
 * `commitlint.config.ts`.
 */
const CONVENTIONAL_COMMIT_PATTERN =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^()\n]+\))?!?: .+/;

/**
 * Strip an HTML comment (`<!-- ... -->`) from a block of text. Template guidance
 * lives in comments; it must not count as user-provided content.
 */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * A section is "placeholder-only" when, after removing HTML comments, every
 * remaining non-empty line is just a bare bullet marker (`-`, `*`, or `+`) or an
 * empty checkbox with no text. Real content — prose, a filled checkbox, an
 * image, a link — makes it pass.
 */
function isPlaceholderOnly(sectionBody) {
  const withoutComments = stripHtmlComments(sectionBody);
  const meaningfulLines = withoutComments
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (meaningfulLines.length === 0) {
    return true;
  }

  return meaningfulLines.every((line) => {
    // A bare bullet with nothing after it: "-", "*", "+".
    if (/^[-*+]$/.test(line)) {
      return true;
    }
    // A bullet whose only content is an empty checkbox: "- [ ]".
    if (/^[-*+]\s+\[[ xX]?\]\s*$/.test(line)) {
      return true;
    }
    return false;
  });
}

/**
 * Split a Markdown body into `{ heading, body }` sections keyed by the first
 * heading text. Headings are ATX (`#`, `##`, ...). The body of a section runs
 * until the next heading of any level.
 */
function splitSections(body) {
  const lines = body.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*\S)\s*$/);
    if (headingMatch) {
      if (current) {
        sections.push(current);
      }
      current = { heading: headingMatch[1].trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) {
    sections.push(current);
  }

  return sections.map((section) => ({
    heading: section.heading,
    body: section.bodyLines.join('\n'),
  }));
}

/** The proof section's heading — its rules are stricter than the others'. */
const PROOF_HEADING = 'Behavioural Proof (with video and screenshots)';

/** Collect title errors. Returns an array (empty when the title is valid). */
function collectTitleErrors(title) {
  const safeTitle = typeof title === 'string' ? title.trim() : '';
  if (!safeTitle) {
    return ['PR title is empty. Use Conventional Commits: `type(scope): summary`.'];
  }
  if (!CONVENTIONAL_COMMIT_PATTERN.test(safeTitle)) {
    return [
      `PR title is not Conventional Commits: "${safeTitle}". ` +
        'Use `type(scope): summary` or `type: summary` ' +
        '(type ∈ feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert); ' +
        'do not add `[agent]`/`[claude]`-style prefixes.',
    ];
  }
  return [];
}

/**
 * Locate each required section, in order. Returns `{ errors, foundIndexBySection }`.
 * A section present but out of order is reported as out-of-order, not missing.
 */
function locateSections(headings) {
  const errors = [];
  const foundIndexBySection = new Map();
  let searchFrom = 0;

  for (const required of REQUIRED_SECTIONS) {
    const foundAt = headings.indexOf(required, searchFrom);
    if (foundAt !== -1) {
      foundIndexBySection.set(required, foundAt);
      searchFrom = foundAt + 1;
    } else if (headings.includes(required)) {
      errors.push(
        `Section "${required}" is out of order. Required order: ` +
          `${REQUIRED_SECTIONS.map((heading) => `"${heading}"`).join(' → ')}.`,
      );
    } else {
      errors.push(`Missing required section heading: "${required}".`);
    }
  }
  return { errors, foundIndexBySection };
}

/** Every located section must carry real content, and proof needs an image or N/A. */
function collectContentErrors(sections, foundIndexBySection) {
  const errors = [];
  for (const [required, index] of foundIndexBySection) {
    if (required === PROOF_HEADING) {
      errors.push(...collectProofErrors(sections[index].body));
    } else if (isPlaceholderOnly(sections[index].body)) {
      errors.push(
        `Section "${required}" is empty or placeholder-only. ` +
          'Fill it with real content (bare `-` bullets and empty checkboxes do not count).',
      );
    }
  }
  return errors;
}

/** The proof section needs an inline image or the exact "Not applicable" string. */
function collectProofErrors(proofBody) {
  const stripped = stripHtmlComments(proofBody);
  if (stripped.includes(INLINE_IMAGE_MARKER) || stripped.includes(NOT_APPLICABLE_MARKER)) {
    return [];
  }
  return [
    `Section "${PROOF_HEADING}" has no proof. ` +
      'Embed a screenshot inline with `![alt](...png?raw=1)`, ' +
      'or write the exact string `Not applicable` with the technical reason.',
  ];
}

/**
 * Validate a PR title and body. Returns `{ ok, errors }`; `errors` is an array
 * of actionable strings. Pure and side-effect free so it can be unit-tested.
 */
export function validatePullRequest({ title, body }) {
  const sections = splitSections(typeof body === 'string' ? body : '');
  const headings = sections.map((section) => section.heading);
  const located = locateSections(headings);

  const errors = [
    ...collectTitleErrors(title),
    ...located.errors,
    ...collectContentErrors(sections, located.foundIndexBySection),
  ];

  return { ok: errors.length === 0, errors };
}

/**
 * Decode an env var populated with `${{ toJSON(...) }}`. `toJSON` emits a
 * JSON-encoded value (a quoted string, or `null` for an empty field), so parse
 * it back to raw text. Fall back to the literal value if it is not valid JSON,
 * so the script also works when a caller sets the raw string directly.
 */
function decodeEnv(rawValue) {
  if (rawValue === undefined) {
    return '';
  }
  try {
    const parsed = JSON.parse(rawValue);
    return typeof parsed === 'string' ? parsed : rawValue;
  } catch {
    return rawValue;
  }
}

function runCli() {
  const result = validatePullRequest({
    title: decodeEnv(process.env.PR_TITLE),
    body: decodeEnv(process.env.PR_BODY),
  });

  if (result.ok) {
    console.log('PR body and title satisfy the quality contract.');
    process.exit(0);
  }

  console.error('PR quality contract failed:\n');
  for (const error of result.errors) {
    console.error(`  ✗ ${error}`);
  }
  console.error(
    '\nSee `.github/pull_request_template.md` and ' + '`.agents/project/DEFINITION_OF_DONE.md`.',
  );
  process.exit(1);
}

// Run the CLI only when invoked directly, not when imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
