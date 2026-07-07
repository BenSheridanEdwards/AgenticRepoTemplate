#!/usr/bin/env node
/**
 * Enforce the repository's own context-layer invariants.
 *
 * The context layer (the operating contract, the multi-vendor manifest, the
 * project docs, the house skills) is the part of the standard that is otherwise
 * pure documentation: nothing mechanical fails when a file is deleted, renamed,
 * emptied, or quietly turned into a symlink. This checker closes that gap. It
 * asserts the invariants the docs describe and fails closed with an actionable
 * message per violation, so the context layer is dogfooded like any other gate.
 *
 * It exports `checkContextLayer` for unit tests (pure, filesystem is injected)
 * and runs the CLI when invoked directly. The CLI exits 0 with a single "OK"
 * line when every invariant holds, and exits 1 listing every failure otherwise.
 */

import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root: this file lives in `scripts/`, so the root is its parent. */
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

/** Assert `AGENTS.md`: a non-trivial, regular, non-symlink file. */
function checkAgentsContract(filesystem, errors) {
  if (!assertRegularFile(filesystem, 'AGENTS.md', errors)) {
    return;
  }
  const nonEmptyLineCount = countNonEmptyLines(filesystem.readText('AGENTS.md'));
  if (nonEmptyLineCount < MINIMUM_NON_EMPTY_LINES) {
    errors.push(
      `\`AGENTS.md\` is too thin: ${nonEmptyLineCount} non-empty lines, ` +
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

/** Run every context-layer invariant. Returns `{ ok, errors }`; pure. */
export function checkContextLayer(filesystem) {
  const errors = [];

  checkAgentsContract(filesystem, errors);
  checkClaudeLayer(filesystem, errors);

  // The root multi-vendor manifest.
  assertRegularFile(filesystem, 'agents/openai.yaml', errors);

  // The seven project docs.
  for (const documentName of REQUIRED_PROJECT_DOCS) {
    assertRegularFile(filesystem, `.agents/project/${documentName}`, errors);
  }

  // The context index and the running-state ledgers.
  for (const relativePath of ['.agents/README.md', 'PROGRESS.md', 'TODO.md']) {
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
