import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('StyleProof workflow', () => {
  it('lets Playwright own the web server during cache-miss capture', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/styleproof.yml'), 'utf8');

    expect(workflow).not.toContain('E2E_BASE_URL:');
    expect(workflow).not.toContain('pnpm dev &');
    expect(workflow).toContain('git checkout -- package.json pnpm-lock.yaml');
    expect(workflow).toContain('node_modules/styleproof/bin/styleproof-map.mjs');
  });
});
