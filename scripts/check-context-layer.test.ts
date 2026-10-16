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
    listDirectory(relativePath) {
      const prefix = `${relativePath}/`;
      const children = new Map();
      for (const path of Object.keys(files)) {
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
    'AGENTS.md': twentyLineBody,
    'CLAUDE.md': `# CLAUDE.md\n\nRead \`AGENTS.md\` first.\n\n${twentyLineBody}`,
    'agents/openai.yaml': 'interface: {}\n',
    '.agents/project/ARCHITECTURE.md': 'architecture',
    '.agents/project/CONVENTIONS.md': 'conventions',
    '.agents/project/TECH_STACK.md': 'tech stack',
    '.agents/project/GLOSSARY.md': 'glossary',
    '.agents/project/DEFINITION_OF_DONE.md': 'done',
    '.agents/project/QUALITY_GATES.md': 'gates',
    '.agents/project/PR_QUALITY.md': 'pr quality',
    '.agents/README.md': 'readme',
    'PROGRESS.md': 'progress',
    'TODO.md': 'todo',
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

  it('fails when AGENTS.md has too few non-empty lines', () => {
    const files = buildPassingTree();
    files['AGENTS.md'] = 'one line only';
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
    const identical = `Read \`AGENTS.md\` first.\n${'contract\n'.repeat(25)}`;
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

  it('fails, naming both files and the next free number, when two ADRs share a number', () => {
    const files = buildPassingTree();
    files['.agents/decisions/0002-pause-a-tool.md'] = '# 2. Pause a tool\n';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    const message = result.errors.join('\n');
    expect(message).toContain('ADR 0002 is used by');
    expect(message).toContain('0002-gates-as-code.md');
    expect(message).toContain('0002-pause-a-tool.md');
    expect(message).toContain('renumber yours to 0003');
  });

  it("fails when an ADR's title number does not match its file name", () => {
    const files = buildPassingTree();
    files['.agents/decisions/0002-gates-as-code.md'] = '# 3. Gates as code\n';
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('must start its title with `# 2.`');
  });

  it('fails when the decisions directory is missing', () => {
    const files = buildPassingTree();
    delete files['.agents/decisions/0001-record-decisions.md'];
    delete files['.agents/decisions/0002-gates-as-code.md'];
    const result = checkContextLayer(createInMemoryFilesystem({ files }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Missing required directory: `.agents/decisions/`');
  });
});
