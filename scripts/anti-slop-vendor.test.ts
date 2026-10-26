/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAntiSlopVendor } from './check-anti-slop-vendor.mjs';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VENDOR = 'vendor/anti-slop';
const SOURCE = `${VENDOR}/rules/example.ts`;
const WHOLE = 'first\nsecond\nthird\n';
const PREFIX = 'first\n';
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const write = (root: string, path: string, bytes: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
};

describe('anti-slop provenance', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'anti-slop-vendor-'));
    write(root, `${VENDOR}/UPSTREAM.sha256`, `${hash(WHOLE)}  ${SOURCE}\n`);
    write(root, `${VENDOR}/UPSTREAM.prefixes`, `${hash(PREFIX)}  1  ${SOURCE}\n`);
    write(root, `${VENDOR}/UPSTREAM.md`, 'Provenance metadata\n');
    write(root, SOURCE, WHOLE);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('passes whole files before and after wiring', () => {
    expect(checkAntiSlopVendor(root)).toEqual([]);
    write(root, '.oxlintrc.json', '{}');
    expect(checkAntiSlopVendor(root)).toEqual([]);
  });

  it('rejects changed bytes', () => {
    write(root, SOURCE, `${WHOLE}changed\n`);
    expect(checkAntiSlopVendor(root)).toEqual([`${SOURCE}: hash mismatch`]);
  });

  it.each(['extra.ts', 'vendor/eslint-stylistic/UPSTREAM.md'])('rejects unlisted %s', (path) => {
    write(root, `${VENDOR}/${path}`, 'unlisted');
    expect(checkAntiSlopVendor(root)).toEqual([`${VENDOR}/${path}: unlisted file`]);
  });

  it('accepts only declared prefixes before wiring, and none after wiring', () => {
    write(root, SOURCE, PREFIX);
    expect(checkAntiSlopVendor(root)).toEqual([]);
    write(root, SOURCE, 'first\nsecond\n');
    expect(checkAntiSlopVendor(root)).toEqual([`${SOURCE}: hash mismatch`]);
    write(root, SOURCE, PREFIX);
    write(root, '.oxlintrc.json', '{}');
    expect(checkAntiSlopVendor(root)).toEqual([`${SOURCE}: hash mismatch`]);
  });

  it('requires every listed file after wiring', () => {
    rmSync(join(root, SOURCE));
    expect(checkAntiSlopVendor(root)).toEqual([]);
    write(root, '.oxlintrc.json', '{}');
    expect(checkAntiSlopVendor(root)).toEqual([`${SOURCE}: missing file`]);
  });

  it('rejects a symlink even when its target has the expected bytes', () => {
    write(root, 'outside.ts', WHOLE);
    rmSync(join(root, SOURCE));
    symlinkSync(join(root, 'outside.ts'), join(root, SOURCE));
    expect(checkAntiSlopVendor(root)).toEqual([`${SOURCE}: expected regular file`]);
  });

  it('checks the real repository tree', () => {
    expect(checkAntiSlopVendor(REPO)).toEqual([]);
  });

  it.each([
    '../escape.ts',
    './example.ts',
    'rules//example.ts',
  ])('rejects malformed path %s with its original manifest line number', (path) => {
    write(root, `${VENDOR}/UPSTREAM.sha256`, `\n${hash(WHOLE)}  ${VENDOR}/${path}\n`);
    expect(() => checkAntiSlopVendor(root)).toThrow(
      `${VENDOR}/UPSTREAM.sha256:2: invalid manifest entry`,
    );
  });

  it('rejects conflicting duplicate whole-file entries', () => {
    write(
      root,
      `${VENDOR}/UPSTREAM.sha256`,
      `${hash('wrong')}  ${SOURCE}\n${hash(WHOLE)}  ${SOURCE}\n`,
    );
    expect(() => checkAntiSlopVendor(root)).toThrow(`${VENDOR}/UPSTREAM.sha256: duplicate path`);
  });

  it('reports CLI success and exits nonzero on a mismatch', () => {
    const run = () =>
      spawnSync(process.execPath, [join(REPO, 'scripts/check-anti-slop-vendor.mjs')], {
        cwd: root,
        encoding: 'utf8',
      });
    expect(run().status).toBe(0);
    write(root, SOURCE, 'wrong');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${SOURCE}: hash mismatch`);
  });
});
