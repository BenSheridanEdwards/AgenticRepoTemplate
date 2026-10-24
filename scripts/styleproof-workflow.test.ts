import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const workflow = readFileSync(resolve(root, '.github/workflows/styleproof.yml'), 'utf8');
const capture = readFileSync(resolve(root, 'apps/web/e2e/styleproof/gallery.capture.ts'), 'utf8');
const config = readFileSync(resolve(root, 'playwright.styleproof.config.ts'), 'utf8');
const styleproof = readFileSync(resolve(root, 'styleproof.config.ts'), 'utf8');

test('pins each StyleProof action to an immutable commit', () => {
  const refs = [...workflow.matchAll(/uses: BenSheridanEdwards\/StyleProof[^@\s]*@([^\s]+)/g)];
  expect(refs.length).toBeGreaterThan(0);
  for (const [, ref] of refs) expect(ref).toMatch(/^[a-f0-9]{40}$/);
});

test('captures only the gallery and reports advisory diffs without a persistent store', () => {
  expect(workflow).toContain('mode: advisory');
  expect(workflow).toContain('--no-store');
  expect(workflow).not.toMatch(/styleproof\s+crawl|--crawl/);
  expect(capture).toContain('defineStyleMapCapture');
  expect(capture).not.toContain('defineCrawlCapture');
  expect(config).toContain("testDir: './apps/web/e2e/styleproof'");
  expect(styleproof).toContain("spec: 'apps/web/e2e/styleproof/gallery.capture.ts'");
  expect(capture).toContain('data-component');
  expect(capture).toContain('toBeVisible');
});

test('loads the config without importing another Playwright runtime in the base checkout', () => {
  expect(styleproof).toContain("import type { StyleProofConfig } from 'styleproof'");
  expect(styleproof).toContain('satisfies StyleProofConfig');
  expect(styleproof).not.toContain('defineConfig');
});
