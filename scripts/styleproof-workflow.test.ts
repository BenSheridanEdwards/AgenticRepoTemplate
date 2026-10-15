import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import config from '../styleproof.config';

// styleproof ships ESM only, which this CJS Jest runtime cannot load.
jest.mock('styleproof', () => ({ defineConfig: <T>(value: T) => value }));

const workflow = (name: string) =>
  readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');

describe('StyleProof review gate', () => {
  it('blocks the merge until a reviewer approves style changes', () => {
    expect(config.blocking).toBe(true);
    expect(config.requireApproval).toBe(true);
    expect(workflow('styleproof.yml')).toContain('require-approval: true');
  });

  it.each([
    'styleproof.yml',
    'styleproof-approve.yml',
  ])('pins every StyleProof reference in %s to a release commit', (name) => {
    const refs = workflow(name).match(/BenSheridanEdwards\/StyleProof[^@\s]*@\S+/g) ?? [];

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ref).toMatch(/@[0-9a-f]{40}$/);
  });
});
