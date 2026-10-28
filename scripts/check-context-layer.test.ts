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
    'AGENTS.md': `${twentyLineBody}\nRead REVIEW.md.`,
    '.claude/CLAUDE.md': '@../AGENTS.md\n',
    'REVIEW.md': 'review rules for the bot reviewer',
    '.cursor/BUGBOT.md': 'See `REVIEW.md` at the repository root.',
    '.agents/project/ARCHITECTURE.md': 'architecture',
    '.agents/project/CONVENTIONS.md': 'conventions',
    '.agents/project/TECH_STACK.md': 'tech stack',
    '.agents/project/GLOSSARY.md': 'glossary',
    '.agents/project/DEFINITION_OF_DONE.md': 'done',
    '.agents/project/QUALITY_GATES.md': 'gates',
    '.agents/project/PR_QUALITY.md': 'pr quality',
    '.claude/skills/adopt-the-factory/SKILL.md': skillFrontmatter,
    '.claude/skills/pr-quality-contract/SKILL.md': skillFrontmatter,
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

  it('passes without a top-level OpenAI manifest', () => {
    const files = buildPassingTree();
    expect(files).not.toHaveProperty(['.agents/openai.yaml']);
    expect(checkContextLayer(createInMemoryFilesystem({ files }))).toEqual({
      ok: true,
      errors: [],
    });
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

  it('fails when AGENTS.md has fewer than 20 non-empty lines', () => {
    const files = buildPassingTree();
    files['AGENTS.md'] = `${'line\n'.repeat(18)}Read REVIEW.md.\n   \n`;
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.errors.join('\n')).toContain('too thin: 19 non-empty lines');
  });

  it.each([32768, 32769])('checks the AGENTS.md byte budget at %i bytes', (bytes) => {
    const files = buildPassingTree();
    const body = `${'line\n'.repeat(19)}Read REVIEW.md.\n`;
    files['AGENTS.md'] =
      body +
      'é'.repeat(Math.floor((bytes - body.length) / 2)) +
      'x'.repeat((bytes - body.length) % 2);
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(bytes === 32768);
    if (bytes > 32768) {
      expect(result.errors.join('\n')).toContain('32769 bytes, expected at most 32768');
    }
  });

  it.each([
    ['lacks the import line', 'Read AGENTS.md.'],
    ['has the import inside a fence', '```md\n@../AGENTS.md\n```'],
    ['has the import inside prose', 'Read @../AGENTS.md now.'],
  ])('fails when .claude/CLAUDE.md %s', (_description, text) => {
    const files = buildPassingTree();
    files['.claude/CLAUDE.md'] = text;
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.errors.join('\n')).toContain(
      '`.claude/CLAUDE.md` must import the operating contract on its own line, `@../AGENTS.md`',
    );
  });

  it.each(['AGENTS.md', '.claude/CLAUDE.md'])('reports a missing %s once', (path) => {
    const files = buildPassingTree();
    delete files[path];
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.errors.filter((error) => error.includes(path))).toHaveLength(1);
  });

  it('fails when the Claude import is a symbolic link', () => {
    const files = buildPassingTree();
    delete files['.claude/CLAUDE.md'];
    const result = checkContextLayer(
      createInMemoryFilesystem({
        files,
        symlinks: { '.claude/CLAUDE.md': 'AGENTS.md' },
      }),
    );
    expect(result.errors.join('\n')).toContain('symbolic link');
  });

  it('fails, listing the file, when the review-rules file is missing', () => {
    const files = buildPassingTree();
    delete files['REVIEW.md'];
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Missing required file: `REVIEW.md`');
  });

  it('fails when the guide stops referencing REVIEW.md', () => {
    const files = buildPassingTree();
    files['AGENTS.md'] = files['AGENTS.md'].replace('Read REVIEW.md.', 'Read the rules.');
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      '`AGENTS.md` must reference `REVIEW.md` so Codex and Claude read the review rules on every PR.',
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

  it('passes with the merged skills and without the retired skill folders', () => {
    const files = buildPassingTree();
    const skillPaths = Object.keys(files).filter((path) => path.startsWith('.claude/skills/'));
    expect(skillPaths).toEqual([
      '.claude/skills/adopt-the-factory/SKILL.md',
      '.claude/skills/pr-quality-contract/SKILL.md',
    ]);
    expect(checkContextLayer(createInMemoryFilesystem({ files }))).toEqual({
      ok: true,
      errors: [],
    });
  });

  it.each([
    'adopt-the-factory',
    'pr-quality-contract',
  ])('fails when the merged %s skill is missing', (name) => {
    const files = buildPassingTree();
    const path = `.claude/skills/${name}/SKILL.md`;
    delete files[path];
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `Missing required file: \`${path}\`. The context layer requires it.`,
    );
  });

  it.each([
    'adopt-the-factory',
    'pr-quality-contract',
  ])('fails when %s is missing its frontmatter description', (name) => {
    const files = buildPassingTree();
    files[`.claude/skills/${name}/SKILL.md`] = ['---', 'name: a-skill', '---'].join('\n');
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
