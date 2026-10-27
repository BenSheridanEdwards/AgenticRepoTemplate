import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContextLayer, createNodeFilesystem } from './check-context-layer.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * An in-memory filesystem matching the port `checkContextLayer` consumes.
 * `files` maps a repository-relative path to its content; `symlinks` maps a path
 * to its link target. A path present in neither is treated as missing.
 */
function createInMemoryFilesystem({ files = {}, symlinks = {} }) {
  return {
    lstat(relativePath) {
      if (Object.hasOwn(symlinks, relativePath)) {
        return { isFile: false, isSymbolicLink: true };
      }
      if (Object.hasOwn(files, relativePath)) {
        return { isFile: true, isSymbolicLink: false };
      }
      const error = new Error(`ENOENT: ${relativePath}`);
      throw error;
    },
    readText(relativePath) {
      if (!Object.hasOwn(files, relativePath)) {
        throw new Error(`ENOENT: ${relativePath}`);
      }
      return files[relativePath];
    },
    readSymbolicLinkTarget(relativePath) {
      return symlinks[relativePath];
    },
    listTrackedFiles() {
      return [...Object.keys(files), ...Object.keys(symlinks)];
    },
    listDirectory(relativePath) {
      const prefix = `${relativePath}/`;
      const children = new Map();
      for (const path of [...Object.keys(files), ...Object.keys(symlinks)]) {
        if (path.startsWith(prefix)) {
          const [name, ...rest] = path.slice(prefix.length).split('/');
          children.set(name, children.get(name) || rest.length > 0);
        }
      }
      if (children.size === 0) {
        throw new Error(`ENOENT: ${relativePath}`);
      }
      return [...children].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
  };
}

/** Every path the checker requires, populated with content that passes. */
function buildPassingTree() {
  const twentyLineBody = Array.from(
    { length: 25 },
    (_unused, index) => `contract line ${index + 1}`,
  ).join('\n');

  const skillFrontmatter = [
    '---',
    'name: a-skill',
    'description: does one job',
    '---',
    'body',
  ].join('\n');

  return {
    'AGENTS.md': '# AGENTS.md\n\nStart here: `.agents/START_HERE.md`.\n',
    'CLAUDE.md': '# CLAUDE.md\n\nRead `.agents/START_HERE.md`.\n\n@.agents/START_HERE.md\n',
    'REVIEW.md': 'review rules for the bot reviewer',
    '.cursor/BUGBOT.md': 'See `REVIEW.md` at the repository root.',
    '.agents/openai.yaml': 'interface: {}\n',
    '.agents/project/ARCHITECTURE.md': 'architecture',
    '.agents/project/CONVENTIONS.md': 'conventions',
    '.agents/project/TECH_STACK.md': 'tech stack',
    '.agents/project/GLOSSARY.md': 'glossary',
    '.agents/project/DEFINITION_OF_DONE.md': 'done',
    '.agents/project/QUALITY_GATES.md': 'gates',
    '.agents/project/PR_QUALITY.md': 'pr quality',
    '.agents/START_HERE.md': `${twentyLineBody}\nRead REVIEW.md.`,
    '.claude/skills/pr-quality-contract/SKILL.md': skillFrontmatter,
    '.claude/skills/pr-inline-screenshot-proof/SKILL.md': skillFrontmatter,
    '.agents/decisions/0001-record-decisions.md': '# 1. Record decisions\n',
    '.agents/decisions/0002-gates-as-code.md': '# 2. Gates as code\n',
  };
}

describe('checkContextLayer', () => {
  it('passes on the real repository checkout', () => {
    const result = checkContextLayer(createNodeFilesystem(REPOSITORY_ROOT));
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('passes on a well-formed in-memory tree without task ledgers', () => {
    const filesystem = createInMemoryFilesystem({ files: buildPassingTree() });
    const result = checkContextLayer(filesystem);
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('fails, listing the file, when a required file is missing', () => {
    const files = buildPassingTree();
    delete files['.agents/project/GLOSSARY.md'];
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('.agents/project/GLOSSARY.md');
    expect(result.errors.join('\n')).toContain('Missing required file');
  });

  it('fails when AGENTS.md is a symbolic link rather than a regular file', () => {
    const files = buildPassingTree();
    delete files['AGENTS.md'];
    const result = checkContextLayer(
      createInMemoryFilesystem({ files, symlinks: { 'AGENTS.md': 'elsewhere.md' } }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('AGENTS.md');
    expect(result.errors.join('\n')).toContain('symbolic link');
  });

  it('fails when AGENTS.md does not point to the start-here guide', () => {
    const files = buildPassingTree();
    files['AGENTS.md'] = '# AGENTS.md\n\nRead the docs.\n';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('must point to `.agents/START_HERE.md`');
  });

  it('fails when the start-here guide has too few non-empty lines', () => {
    const files = buildPassingTree();
    files['.agents/START_HERE.md'] = 'one line only';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('too thin');
  });

  it('fails when CLAUDE.md does not point to the guide', () => {
    const files = buildPassingTree();
    files['CLAUDE.md'] = '# CLAUDE.md\nRead the docs.\n';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('`CLAUDE.md` must point to `.agents/START_HERE.md`');
  });

  it.each([
    ['lacks the import line', '# CLAUDE.md\nRead `.agents/START_HERE.md`.\n'],
    [
      'has the import line only inside a fence',
      '# CLAUDE.md\n```md\n@.agents/START_HERE.md\n```\n',
    ],
  ])('fails when CLAUDE.md %s', (_description, text) => {
    const files = buildPassingTree();
    files['CLAUDE.md'] = text;
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      '`CLAUDE.md` must import the start-here guide on its own line, `@.agents/START_HERE.md`, so Claude Code loads it at launch.',
    );
  });

  it.each(['AGENTS.md', 'CLAUDE.md'])('fails when %s has more than 10 non-empty lines', (path) => {
    const files = buildPassingTree();
    files[path] = `Read .agents/START_HERE.md\n@.agents/START_HERE.md\n${'line\n'.repeat(9)}`;
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(`\`${path}\` has 11 non-empty lines`);
    expect(result.errors.join('\n')).toContain('only a pointer');
  });

  it.each([
    // Two pointer lines plus eight padding lines make ten non-empty lines.
    ['AGENTS.md', 'line\n'.repeat(8)],
    // Three pointer lines plus seven padding lines make ten non-empty lines.
    ['CLAUDE.md', 'line\n'.repeat(7)],
  ])('passes when %s has 10 non-empty lines and whitespace', (path, padding) => {
    const files = buildPassingTree();
    files[path] = `${files[path]}${padding}   \n`;
    expect(checkContextLayer(createInMemoryFilesystem({ files }))).toEqual({
      ok: true,
      errors: [],
    });
  });

  it.each(['missing', 'symlinked'])('reports a %s CLAUDE.md only once', (kind) => {
    const files = buildPassingTree();
    delete files['CLAUDE.md'];
    const symlinks = kind === 'symlinked' ? { 'CLAUDE.md': 'AGENTS.md' } : {};
    const result = checkContextLayer(createInMemoryFilesystem({ files, symlinks }));
    expect(result.errors.filter((error) => error.includes('CLAUDE.md'))).toHaveLength(1);
  });

  it('fails when CLAUDE.md is byte-identical to AGENTS.md', () => {
    const files = buildPassingTree();
    // Satisfy both pointer and import rules to isolate byte identity.
    const identical = 'Read `.agents/START_HERE.md`.\n@.agents/START_HERE.md\n';
    files['AGENTS.md'] = identical;
    files['CLAUDE.md'] = identical;
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors.join('\n')).toContain('byte-identical');
  });

  it('fails, listing the file, when the review-rules file is missing', () => {
    const files = buildPassingTree();
    delete files['REVIEW.md'];
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Missing required file: `REVIEW.md`');
  });

  it('passes when AGENTS.md does not reference REVIEW.md', () => {
    const files = buildPassingTree();
    expect(files['AGENTS.md']).not.toContain('REVIEW.md');
    expect(checkContextLayer(createInMemoryFilesystem({ files }))).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('fails when the guide stops referencing REVIEW.md', () => {
    const files = buildPassingTree();
    files['.agents/START_HERE.md'] = files['.agents/START_HERE.md'].replace(
      'Read REVIEW.md.',
      'Read the rules.',
    );
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      '`.agents/START_HERE.md` must reference `REVIEW.md` so Codex and Claude read the review rules on every PR.',
    );
  });

  it('fails, listing the file, when the Cursor Bugbot pointer is missing', () => {
    const files = buildPassingTree();
    delete files['.cursor/BUGBOT.md'];
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Missing required file: `.cursor/BUGBOT.md`');
  });

  it('fails when the Cursor Bugbot pointer stops referencing the review-rules file', () => {
    const files = buildPassingTree();
    files['.cursor/BUGBOT.md'] = '# Cursor Bugbot\n\nReview carefully.\n';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('`.cursor/BUGBOT.md` must reference `REVIEW.md`');
  });

  it('fails when a house skill is missing its frontmatter description', () => {
    const files = buildPassingTree();
    files['.claude/skills/pr-quality-contract/SKILL.md'] = ['---', 'name: a-skill', '---'].join(
      '\n',
    );
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('description:');
  });

  it('fails, naming the file and lines, when a merge leaves a section in a doc twice', () => {
    const files = buildPassingTree();
    const approval = '## Enforcement approval\n\nTick the box.\n';
    files['.agents/project/QUALITY_GATES.md'] =
      `# Quality gates\n\n${approval}\n## Placement rules\n\n${approval}`;
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    const message = result.errors.join('\n');
    expect(message).toContain(
      '`.agents/project/QUALITY_GATES.md` has the section `## Enforcement approval` 2 times',
    );
    expect(message).toContain('lines 3, 9');
  });

  it('passes when the same heading sits under different parents or inside a code block', () => {
    const files = buildPassingTree();
    files['.agents/project/CONVENTIONS.md'] = [
      '# Conventions',
      '## Naming',
      '### Example',
      '## Imports',
      '### Example',
      '```md',
      '## Naming',
      '```',
    ].join('\n');
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('reports only the outermost copy when a whole section with sub-sections is duplicated', () => {
    const files = buildPassingTree();
    const section = '## Approval\n### Who\n### When\n';
    files['README.md'] = `# Readme\n${section}## Other\n${section}`;
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(
      '`README.md` has the section `## Approval` 2 times under `# Readme`',
    );
  });

  it('skips front matter and nested or tilde fences, and matches closing hashes', () => {
    const files = buildPassingTree();
    files['.agents/project/GLOSSARY.md'] = [
      '---',
      '# a yaml comment',
      '# a yaml comment',
      '---',
      '# Glossary',
      '## Term',
      '````md',
      '```',
      '## Term',
      '```',
      '````',
      '~~~',
      '## Term',
      '~~~',
    ].join('\n');
    expect(checkContextLayer(createInMemoryFilesystem({ files }))).toEqual({
      ok: true,
      errors: [],
    });
    files['.agents/project/GLOSSARY.md'] = '# Glossary\n## Term\n## Term ##\n';
    expect(checkContextLayer(createInMemoryFilesystem({ files })).errors.join('\n')).toContain(
      'has the section `## Term` 2 times',
    );
  });

  it('ignores symlinked docs and Markdown outside the context layer', () => {
    const files = buildPassingTree();
    files['src/notes.md'] = '# A\n## B\n## B\n';
    const result = checkContextLayer(
      createInMemoryFilesystem({ files, symlinks: { '.agents/linked.md': 'elsewhere.md' } }),
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('fails, naming both files, when two ADRs share a number', () => {
    const files = buildPassingTree();
    files['.agents/decisions/0002-pause-a-tool.md'] = '# 2. Pause a tool\n';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    const message = result.errors.join('\n');
    expect(message).toContain('ADR 2 is used by');
    expect(message).toContain('0002-gates-as-code.md');
    expect(message).toContain('0002-pause-a-tool.md');
    expect(message).toContain('a number above 2 that no open PR uses');
  });

  it("fails when an ADR's title number does not match its file name", () => {
    const files = buildPassingTree();
    files['.agents/decisions/0002-gates-as-code.md'] = '# 3. Gates as code\n';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('must start with the title `# 2.`');
  });

  it('fails when the decisions directory is missing', () => {
    const files = buildPassingTree();
    delete files['.agents/decisions/0001-record-decisions.md'];
    delete files['.agents/decisions/0002-gates-as-code.md'];
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Missing required directory: `.agents/decisions/`');
  });

  it('fails when an ADR is not named NNNN-slug.md, so a typo cannot hide a duplicate', () => {
    const files = buildPassingTree();
    files['.agents/decisions/002-pause-a-tool.md'] = '# 2. Pause a tool\n';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      '`.agents/decisions/002-pause-a-tool.md` must be named `NNNN-slug.md`',
    );
  });

  it('reports a symlinked ADR instead of crashing on it', () => {
    const files = buildPassingTree();
    const result = checkContextLayer(
      createInMemoryFilesystem({
        files,
        symlinks: { '.agents/decisions/0003-linked.md': 'nowhere.md' },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      '`.agents/decisions/0003-linked.md` is a symbolic link',
    );
  });

  it('reads the title past a byte-order mark', () => {
    const files = buildPassingTree();
    files['.agents/decisions/0002-gates-as-code.md'] = '\uFEFF# 2. Gates as code\n';
    expect(checkContextLayer(createInMemoryFilesystem({ files }))).toEqual({
      ok: true,
      errors: [],
    });
  });
});
