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
    'AGENTS.md': '# AGENTS.md\n\nStart here: `.agents/README.md`.\n',
    'CLAUDE.md': '# CLAUDE.md\n\nRead `AGENTS.md` first.\n',
    '.agents/openai.yaml': 'interface: {}\n',
    '.agents/project/ARCHITECTURE.md': 'architecture',
    '.agents/project/CONVENTIONS.md': 'conventions',
    '.agents/project/TECH_STACK.md': 'tech stack',
    '.agents/project/GLOSSARY.md': 'glossary',
    '.agents/project/DEFINITION_OF_DONE.md': 'done',
    '.agents/project/QUALITY_GATES.md': 'gates',
    '.agents/project/PR_QUALITY.md': 'pr quality',
    '.agents/README.md': twentyLineBody,
    '.agents/PROGRESS.md': 'progress',
    '.agents/TODO.md': 'todo',
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

  it('passes on a well-formed in-memory tree', () => {
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
    expect(result.errors.join('\n')).toContain('must point to `.agents/README.md`');
  });

  it('fails when the start-here guide has too few non-empty lines', () => {
    const files = buildPassingTree();
    files['.agents/README.md'] = 'one line only';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('too thin');
  });

  it('fails when CLAUDE.md does not defer to AGENTS.md in its header', () => {
    const files = buildPassingTree();
    files['CLAUDE.md'] = `# CLAUDE.md\n\nThis file stands alone.\n\n${'x\n'.repeat(25)}`;
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('must defer to');
  });

  it('fails when CLAUDE.md is byte-identical to AGENTS.md', () => {
    const files = buildPassingTree();
    // Identical content that also happens to satisfy the defer check, so the
    // only failure is the byte-identity one.
    const identical = 'Read `AGENTS.md` first. Start here: `.agents/README.md`.\n';
    files['AGENTS.md'] = identical;
    files['CLAUDE.md'] = identical;
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('byte-identical');
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
