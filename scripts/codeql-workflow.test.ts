import { readFileSync } from 'node:fs';

// Workflow permissions are the public contract presented to GitHub Actions.
it('allows CodeQL to read private workflow runs while retaining result upload', () => {
  const workflow = readFileSync('.github/workflows/codeql.yml', 'utf8');
  const permissions = workflow.match(/^permissions:\n((?:[ \t]+.*\n)+)/m)?.[1];
  expect(permissions).toMatch(/^ {2}actions: read$/m);
  expect(permissions).toMatch(/^ {2}contents: read$/m);
  expect(permissions).toMatch(/^ {2}security-events: write$/m);
  expect(workflow).toContain('uses: github/codeql-action/analyze@v4');
  expect(workflow).not.toMatch(/upload:\s*(false|never)|continue-on-error:/);
});
