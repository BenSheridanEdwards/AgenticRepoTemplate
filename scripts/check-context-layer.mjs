#!/usr/bin/env node
/**
 * Enforce the repository's own context-layer invariants.
 *
 * The context layer (the root pointers, the start-here guide, the multi-vendor
 * manifest, the project docs, the house skills) is the part of the standard that is otherwise
 * pure documentation: nothing mechanical fails when a file is deleted, renamed,
 * emptied, or quietly turned into a symlink. This checker closes that gap. It
 * asserts the invariants the docs describe and fails closed with an actionable
 * message per violation, so the context layer is dogfooded like any other gate.
 *
 * It exports `checkContextLayer` for unit tests (pure, filesystem is injected)
 * and runs the CLI when invoked directly. The CLI exits 0 with a single "OK"
 * line when every invariant holds, and exits 1 listing every failure otherwise.
 */

import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root: this file lives in `scripts/`, so the root is its parent. */
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The start-here guide under `.agents/`, where `AGENTS.md` points. */
const START_HERE = '.agents/README.md';

/** A file is "non-trivial" when it has at least this many non-empty lines. */
const MINIMUM_NON_EMPTY_LINES = 20;

/** How many leading lines of `CLAUDE.md` may carry the defer-to-AGENTS reference. */
const CLAUDE_DEFER_HEADER_LINE_COUNT = 10;

/**
 * The seven project docs under `.agents/project/` that the multi-vendor manifest
 * and the Definition of Done both promise exist.
 */
const REQUIRED_PROJECT_DOCS = [
  'ARCHITECTURE.md',
  'CONVENTIONS.md',
  'TECH_STACK.md',
  'GLOSSARY.md',
  'DEFINITION_OF_DONE.md',
  'QUALITY_GATES.md',
  'PR_QUALITY.md',
];

/** The two house skills that back the PR proof contract. */
const REQUIRED_HOUSE_SKILLS = [
  '.claude/skills/pr-quality-contract/SKILL.md',
  '.claude/skills/pr-inline-screenshot-proof/SKILL.md',
];

/** The human-written review rules and the Cursor Bugbot pointer to them. */
const REVIEW_RULES = 'REVIEW.md';
const BUGBOT_POINTER = '.cursor/BUGBOT.md';

/**
 * A minimal filesystem port so the pure checker can be unit-tested against an
 * in-memory tree. All methods take repository-relative paths.
 */
export function createNodeFilesystem(rootDirectory) {
  const toAbsolute = (relativePath) => resolve(rootDirectory, relativePath);
  return {
    lstat(relativePath) {
      const stats = lstatSync(toAbsolute(relativePath));
      return { isFile: stats.isFile(), isSymbolicLink: stats.isSymbolicLink() };
    },
    readText(relativePath) {
      return readFileSync(toAbsolute(relativePath), 'utf8');
    },
    readSymbolicLinkTarget(relativePath) {
      return readlinkSync(toAbsolute(relativePath));
    },
    listTrackedFiles() {
      return execFileSync('git', ['ls-files', '-z'], { cwd: rootDirectory, encoding: 'utf8' })
        .split('\0')
        .filter(Boolean);
    },
    listDirectory(relativePath) {
      return readdirSync(toAbsolute(relativePath), { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
    },
  };
}

/** Count the non-empty (non-whitespace-only) lines in a block of text. */
function countNonEmptyLines(text) {
  return text.split('\n').filter((line) => line.trim().length > 0).length;
}

/**
 * True when `CLAUDE.md`'s first lines defer to `AGENTS.md`: either a "read
 * ... AGENTS.md" style pointer or a "defer ... AGENTS.md" style one.
 */
function defersToAgentsContract(claudeHeaderText) {
  return (
    /read[\s\S]*AGENTS\.md/i.test(claudeHeaderText) ||
    /defer[\s\S]*AGENTS\.md/i.test(claudeHeaderText)
  );
}

/**
 * Assert that a repository-relative path exists as a regular, non-symlink file.
 * Pushes an actionable error and returns false on any violation; returns true
 * when the file is a genuine regular file.
 */
function assertRegularFile(filesystem, relativePath, errors) {
  let stats;
  try {
    stats = filesystem.lstat(relativePath);
  } catch {
    errors.push(`Missing required file: \`${relativePath}\`. The context layer requires it.`);
    return false;
  }
  if (stats.isSymbolicLink) {
    errors.push(
      `\`${relativePath}\` is a symbolic link. It must be a regular file so its ` +
        'content is reviewed in the diff, not aliased to another path.',
    );
    return false;
  }
  if (!stats.isFile) {
    errors.push(`\`${relativePath}\` exists but is not a regular file.`);
    return false;
  }
  return true;
}

/** Assert `AGENTS.md`: a regular, non-symlink file that points to the start-here guide. */
function checkAgentsPointer(filesystem, errors) {
  if (!assertRegularFile(filesystem, 'AGENTS.md', errors)) {
    return;
  }
  if (!filesystem.readText('AGENTS.md').includes(START_HERE)) {
    errors.push(
      `\`AGENTS.md\` must point to \`${START_HERE}\`, the start-here guide. ` +
        'Every agent doc lives under `.agents/`.',
    );
  }
}

/** Assert the start-here guide: a non-trivial, regular, non-symlink file. */
function checkStartHere(filesystem, errors) {
  if (!assertRegularFile(filesystem, START_HERE, errors)) {
    return;
  }
  const nonEmptyLineCount = countNonEmptyLines(filesystem.readText(START_HERE));
  if (nonEmptyLineCount < MINIMUM_NON_EMPTY_LINES) {
    errors.push(
      `\`${START_HERE}\` is too thin: ${nonEmptyLineCount} non-empty lines, ` +
        `expected at least ${MINIMUM_NON_EMPTY_LINES}. It is the operating contract; keep it substantive.`,
    );
  }
}

/**
 * Assert `CLAUDE.md`: a regular file that defers to `AGENTS.md` in its header,
 * is not a symlink to `AGENTS.md`, and is not byte-identical to it.
 */
function checkClaudeLayer(filesystem, errors) {
  if (!assertRegularFile(filesystem, 'CLAUDE.md', errors)) {
    return;
  }
  const claudeText = filesystem.readText('CLAUDE.md');
  const headerText = claudeText.split('\n').slice(0, CLAUDE_DEFER_HEADER_LINE_COUNT).join('\n');
  if (!defersToAgentsContract(headerText)) {
    errors.push(
      `\`CLAUDE.md\` must defer to \`AGENTS.md\` within its first ${CLAUDE_DEFER_HEADER_LINE_COUNT} ` +
        'lines (for example "Read `AGENTS.md` first."). No such reference was found.',
    );
  }

  // A symlink CLAUDE.md is already reported by assertRegularFile, but a regular
  // file that is byte-identical to AGENTS.md defeats the "layer on top" intent.
  let agentsText = '';
  try {
    agentsText = filesystem.readText('AGENTS.md');
  } catch {
    return;
  }
  if (claudeText === agentsText) {
    errors.push(
      '`CLAUDE.md` is byte-identical to `AGENTS.md`. It must add the Claude-specific ' +
        'layer, not duplicate the contract.',
    );
  }
}

/**
 * The tracked context docs a merge can duplicate a section in: root Markdown,
 * everything under `.agents/`, and the house skills. Only tracked files count,
 * so a local scratch note cannot fail a check that CI would pass.
 */
function isContextDoc(path) {
  return (
    path.endsWith('.md') &&
    (!path.includes('/') || path.startsWith('.agents/') || path.startsWith('.claude/skills/'))
  );
}

/** True for a regular file; false for a symlink or a tracked file deleted locally. */
function isReadableDoc(filesystem, path) {
  try {
    return filesystem.lstat(path).isFile;
  } catch {
    return false;
  }
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

/** True when `line` closes a fence opened with `opener`: same character, at least as long, nothing after. */
function closesFence(line, opener) {
  const marker = FENCE.exec(line)?.[1] ?? '';
  return marker[0] === opener[0] && marker.length >= opener.length && line.trim() === marker;
}

/** The number of leading front-matter lines: a `---` block on the first line, or none. */
function frontMatterLength(lines) {
  const closing = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  return closing + 1;
}

/** The document's lines with front matter and fenced code blanked out. */
function proseLines(text) {
  const lines = text.split(/\r?\n/);
  const skipped = frontMatterLength(lines);
  let opener = null;
  return lines.map((line, index) => {
    if (index < skipped) {
      return '';
    }
    if (opener) {
      opener = closesFence(line, opener) ? null : opener;
      return '';
    }
    opener = FENCE.exec(line)?.[1] ?? null;
    return opener ? '' : line;
  });
}

/**
 * Every section, keyed by its heading and the headings above it, with the
 * heading, its parent, and the lines it starts on.
 */
function sectionsOf(text) {
  const sections = new Map();
  const ancestors = [];
  proseLines(text).forEach((line, index) => {
    const match = ATX_HEADING.exec(line);
    if (!match) {
      return;
    }
    const level = match[1].length;
    const heading = `${match[1]} ${match[2]}`;
    while (ancestors.length > 0 && ancestors.at(-1).level >= level) {
      ancestors.pop();
    }
    const key = [...ancestors.map((ancestor) => ancestor.heading), heading].join('\n');
    const section = sections.get(key) ?? {
      key,
      heading,
      parent: ancestors.at(-1)?.heading,
      lines: [],
    };
    section.lines.push(index + 1);
    sections.set(key, section);
    ancestors.push({ level, heading });
  });
  return [...sections.values()];
}

/**
 * Assert no context doc has the same section twice under the same parent. When
 * two branches add the same section in different places, git merges both copies
 * without a conflict. Only the outermost copy is reported, not each heading in it.
 */
function checkDuplicateSections(filesystem, errors) {
  let trackedFiles;
  try {
    trackedFiles = filesystem.listTrackedFiles();
  } catch {
    errors.push(
      'Could not list tracked files with `git ls-files`. Run the check inside the git checkout.',
    );
    return;
  }
  for (const path of trackedFiles.filter(isContextDoc)) {
    if (!isReadableDoc(filesystem, path)) {
      continue;
    }
    const duplicates = sectionsOf(filesystem.readText(path)).filter(
      ({ lines }) => lines.length > 1,
    );
    for (const { key, heading, parent, lines } of duplicates) {
      if (duplicates.some((outer) => key.startsWith(`${outer.key}\n`))) {
        continue;
      }
      errors.push(
        `\`${path}\` has the section \`${heading}\` ${lines.length} times under ` +
          `${parent ? `\`${parent}\`` : 'the top level'} (lines ${lines.join(', ')}). A merge usually ` +
          'does this when both sides added the section. Keep one copy, merging any lines that differ, ' +
          'and delete the rest.',
      );
    }
  }
}

/** Where ADRs live, and the `NNNN-slug.md` name each one has. */
const DECISIONS_DIRECTORY = '.agents/decisions';
const ADR_FILE_NAME = /^(\d{4})-[^/]+\.md$/;

/** The Markdown files in `.agents/decisions/`. */
function listDecisionFiles(filesystem) {
  return filesystem
    .listDirectory(DECISIONS_DIRECTORY)
    .filter(({ name, isDirectory }) => !isDirectory && name.endsWith('.md'))
    .map(({ name }) => ({ name, path: `${DECISIONS_DIRECTORY}/${name}` }));
}

/** The `N` in an ADR's first line, `# N. Title`, or NaN when it has none. */
function titleNumber(text) {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  return Number(/^# (\d+)\./.exec(firstLine)?.[1]);
}

/**
 * Assert each ADR is named `NNNN-slug.md`, opens with a matching `# N.` title,
 * and has a number no other ADR uses. Two branches that each add "the next" ADR
 * get different file names, so git merges both without a conflict; this is
 * where the clash shows up.
 */
function checkDecisionNumbers(filesystem, errors) {
  let files;
  try {
    files = listDecisionFiles(filesystem);
  } catch {
    errors.push(`Missing required directory: \`${DECISIONS_DIRECTORY}/\`. ADRs live there.`);
    return;
  }

  const decisions = [];
  for (const { name, path } of files) {
    const match = ADR_FILE_NAME.exec(name);
    if (!match) {
      errors.push(`\`${path}\` must be named \`NNNN-slug.md\`, like the other ADRs.`);
      continue;
    }
    if (!assertRegularFile(filesystem, path, errors)) {
      continue;
    }
    const number = Number(match[1]);
    decisions.push({ path, number });
    if (titleNumber(filesystem.readText(path)) !== number) {
      errors.push(`\`${path}\` must start with the title \`# ${number}.\` to match its file name.`);
    }
  }

  const highestNumber = Math.max(0, ...decisions.map(({ number }) => number));
  for (const [number, sharing] of Map.groupBy(decisions, (decision) => decision.number)) {
    if (sharing.length > 1) {
      errors.push(
        `ADR ${number} is used by ${sharing.map(({ path }) => `\`${path}\``).join(' and ')}. ` +
          `Give the one your branch added a number above ${highestNumber} that no open PR uses, ` +
          'then rename the file, change its `# N.` title, and update every link to it.',
      );
    }
  }
}

/**
 * Assert the human-written review rules exist and both reviewer entry points
 * discover them: the root `AGENTS.md` references the file for Codex and Claude,
 * and `.cursor/BUGBOT.md` references it for Cursor Bugbot. Keeping the wiring in
 * one check means the rules a bot reviewer reads after lint cannot silently drop
 * off any reviewer.
 */
function checkReviewRules(filesystem, errors) {
  if (!assertRegularFile(filesystem, REVIEW_RULES, errors)) {
    return;
  }

  try {
    if (!filesystem.readText('AGENTS.md').includes(REVIEW_RULES)) {
      errors.push(
        `\`AGENTS.md\` must reference \`${REVIEW_RULES}\` so Codex and Claude read the ` +
          'review rules on every PR.',
      );
    }
  } catch {
    // A missing or unreadable `AGENTS.md` is already reported by checkAgentsPointer.
  }

  if (!assertRegularFile(filesystem, BUGBOT_POINTER, errors)) {
    return;
  }
  if (!filesystem.readText(BUGBOT_POINTER).includes(REVIEW_RULES)) {
    errors.push(
      `\`${BUGBOT_POINTER}\` must reference \`${REVIEW_RULES}\` so Cursor Bugbot reads the ` +
        'same review rules as Codex and Claude.',
    );
  }
}

/** Run every context-layer invariant. Returns `{ ok, errors }`; pure. */
export function checkContextLayer(filesystem) {
  const errors = [];

  checkAgentsPointer(filesystem, errors);
  checkClaudeLayer(filesystem, errors);
  checkStartHere(filesystem, errors);

  // The multi-vendor manifest.
  assertRegularFile(filesystem, '.agents/openai.yaml', errors);

  // The seven project docs.
  for (const documentName of REQUIRED_PROJECT_DOCS) {
    assertRegularFile(filesystem, `.agents/project/${documentName}`, errors);
  }

  // The running-state ledgers.
  for (const relativePath of ['.agents/PROGRESS.md', '.agents/TODO.md']) {
    assertRegularFile(filesystem, relativePath, errors);
  }

  // The two house skills, each with YAML frontmatter carrying name + description.
  for (const skillPath of REQUIRED_HOUSE_SKILLS) {
    if (!assertRegularFile(filesystem, skillPath, errors)) {
      continue;
    }
    const skillText = filesystem.readText(skillPath);
    const frontmatterMatch = skillText.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      errors.push(`\`${skillPath}\` is missing YAML frontmatter (a leading \`---\` block).`);
      continue;
    }
    const frontmatter = frontmatterMatch[1];
    if (!/^\s*name:\s*\S/m.test(frontmatter)) {
      errors.push(`\`${skillPath}\` frontmatter is missing a \`name:\` field.`);
    }
    if (!/^\s*description:\s*\S/m.test(frontmatter)) {
      errors.push(`\`${skillPath}\` frontmatter is missing a \`description:\` field.`);
    }
  }

  checkReviewRules(filesystem, errors);

  checkDuplicateSections(filesystem, errors);
  checkDecisionNumbers(filesystem, errors);

  return { ok: errors.length === 0, errors };
}

function runCli() {
  const result = checkContextLayer(createNodeFilesystem(REPOSITORY_ROOT));

  if (result.ok) {
    console.log('Context layer OK: all context-layer invariants hold.');
    process.exit(0);
  }

  console.error('Context layer check failed:\n');
  for (const error of result.errors) {
    console.error(`  ✗ ${error}`);
  }
  console.error('\nSee `.agents/project/QUALITY_GATES.md` for the gate matrix.');
  process.exit(1);
}

// Run the CLI only when invoked directly, not when imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
