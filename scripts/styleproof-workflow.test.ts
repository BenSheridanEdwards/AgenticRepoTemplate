import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('StyleProof workflow', () => {
  it('lets Playwright own the web server during cache-miss capture', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/styleproof.yml'), 'utf8');

    expect(workflow).not.toContain('E2E_BASE_URL:');
    expect(workflow).not.toContain('pnpm dev &');
    expect(workflow).toContain('git checkout -- package.json pnpm-lock.yaml');
    expect(workflow).toContain('node_modules/styleproof/bin/styleproof-map.mjs');

    const pullRequestBaseExpression = '$' + '{{ github.event.pull_request.base.sha }}';
    const pullRequestHeadExpression = '$' + '{{ github.event.pull_request.head.sha }}';
    const baseCheckout = workflow.indexOf(`git checkout --force "${pullRequestBaseExpression}"`);
    const baseRestore = workflow.indexOf(`--restore --sha "${pullRequestBaseExpression}"`);
    const headCheckout = workflow.indexOf(`git checkout --force "${pullRequestHeadExpression}"`);
    const headRestore = workflow.indexOf(`--restore --sha "${pullRequestHeadExpression}"`);
    expect(baseCheckout).toBeLessThan(baseRestore);
    expect(baseRestore).toBeLessThan(headCheckout);
    expect(headCheckout).toBeLessThan(headRestore);
  });
});
