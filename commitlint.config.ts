import type { UserConfig } from '@commitlint/types';

/**
 * Conventional Commits, enforced on the `commit-msg` hook.
 *
 * Why this is a quality gate and not a style preference: the commit history is
 * the one artefact every agent and every reviewer reads to understand intent.
 * A machine-checkable format keeps it consistent whether a human or an agent
 * authored the change, and it powers changelog/versioning downstream.
 *
 * See `.agents/decisions/0002-quality-gates-as-code.md`.
 */
const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Keep the set deliberately small and shared by humans and agents.
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    // Bodies often carry URLs and detailed rationale — don't wrap-police them.
    'body-max-line-length': [0, 'always', Number.POSITIVE_INFINITY],
  },
};

export default config;
