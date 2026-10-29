/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
let directory: string;
function write(path: string, contents: string) {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), contents);
}
function lint(advisory = false, extra: string[] = []) {
  const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const command: string = scripts[advisory ? 'lint:anti-slop:advisory' : 'lint:anti-slop'];
  const [executable, ...args] = command.split(' ');
  const result = spawnSync(executable, [...args, '--format', 'json', ...extra, '.'], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(ROOT, 'node_modules/.bin')}:${process.env.PATH}` },
  });
  return { status: result.status, ...JSON.parse(result.stdout) };
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'anti-slop-lint-'));
  const config = JSON.parse(readFileSync(join(ROOT, '.oxlintrc.json'), 'utf8'));
  write(
    '.oxlintrc.json',
    JSON.stringify({
      ...config,
      jsPlugins: config.jsPlugins.map((path: string) => resolve(ROOT, path)),
    }),
  );
  write('anti-slop.advisory.mjs', readFileSync(join(ROOT, 'anti-slop.advisory.mjs'), 'utf8'));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
it.each`
  rule                                                      | bad                                                                                                  | good
  ${'anti-slop(no-module-mocking)'}                         | ${"jest.mock('example');"}                                                                           | ${'jest.fn();'}
  ${'anti-slop(no-reflect-apply)'}                          | ${'Reflect.apply(fn, null, []);'}                                                                    | ${'fn();'}
  ${'anti-slop(no-reflect-get)'}                            | ${"Reflect.get(value, 'id');"}                                                                       | ${'value.id;'}
  ${'anti-slop(no-unknown-type-aliases)'}                   | ${'type Value = unknown;'}                                                                           | ${'type Value = string;'}
  ${'anti-slop(no-widen-then-assert)'}                      | ${'const source = { id: "x" }; const wide: unknown = source; const value = wide as { id: string };'} | ${'const value = { id: "x" };'}
  ${'anti-slop(no-reduce-accumulator-copy)'}                | ${'items.reduce((acc, item) => acc.concat(item), []);'}                                              | ${'[1, 2].map(value => value);'}
  ${'anti-slop(no-runtime-typeof)'}                         | ${'typeof value === "string";'}                                                                      | ${'value.length;'}
  ${'anti-slop(require-safety-comment-for-type-assertion)'} | ${'const value = input as string;'}                                                                  | ${'const value = "text";'}
  ${'anti-slop(no-known-value-widening)'}                   | ${'const value: Record<string, string> = { name: "Ada" };'}                                          | ${'const value = { name: "Ada" } satisfies Record<string, string>;'}
  ${'anti-slop(no-unsafe-dictionary-type)'}                 | ${'type Values = Record<string, unknown>;'}                                                          | ${'type Values = Record<string, string>;'}
  ${'anti-slop(no-unknown-parameters)'}                     | ${'function read(value: unknown) {}'}                                                                | ${'function read(value: string) {}'}
  ${'anti-slop(no-object-parameters)'}                      | ${'function read(value: object) {}'}                                                                 | ${'function read(value: { name: string }) {}'}
  ${'anti-slop(no-chained-type-assertions)'}                | ${'const value = input as unknown as string;'}                                                       | ${'const value = "text";'}
  ${'anti-slop(no-conditional-empty-object-spread)'}        | ${'const value = { ...(present ? { name: "Ada" } : {}) };'}                                          | ${'const value = { name: present ? "Ada" : "Ben" };'}
  ${'anti-slop(no-unknown-returns)'}                        | ${'function read(): unknown { return "text"; }'}                                                     | ${'function read(): string { return "text"; }'}
  ${'anti-slop-effect(no-manual-effect-error-tag)'}         | ${'Effect.catch(error => error._tag === "Missing" ? recover : fail);'}                               | ${'Effect.catchTag("Missing", recover);'}
  ${'anti-slop-effect(no-manual-tag-comparison)'}           | ${'value._tag === "Ready";'}                                                                         | ${'Match.is("Ready")(value);'}
  ${'anti-slop-effect(no-manual-tagged-construction)'}      | ${'const value = { _tag: "Ready" };'}                                                                | ${'const value = Ready.make({});'}
`('$rule rejects a violation and accepts clean code', ({ rule, bad, good }) => {
  write('apps/web/src/example.ts', bad);
  expect(lint()).toMatchObject({
    status: 1,
    diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: rule, severity: 'error' }),
    ]),
  });
  expect(lint(true).status).toBe(1);
  write('apps/web/src/example.ts', good);
  expect(lint()).toMatchObject({ status: 0, diagnostics: [] });
});

it('skips agent, vendor and recorded trial directories in both configs', () => {
  const ignored = `.agent .agents .claude .codex .continue .cursor .gemini .opencode .pi .roo .windsurf vendor
showcase/todo-01 showcase/todo-02 showcase/todo-03 showcase/todo-codex-01 showcase/todo-codex-02 showcase/todo-codex-03`;
  ignored.split(/\s+/).forEach((path) => {
    write(`${path}/example.ts`, "Reflect.get(value, 'id');");
  });
  write('clean.ts', 'export const count = 1;\n\ndebugger;');
  expect(lint()).toMatchObject({ status: 0, diagnostics: [] });
  expect(lint(true)).toMatchObject({ status: 0, diagnostics: [] });
});

it('allows typeof in tooling and rejects it in package source in both configs', () => {
  write('scripts/example.ts', 'typeof value === "string";');
  expect(lint()).toMatchObject({ status: 0, diagnostics: [] });
  expect(lint(true)).toMatchObject({ status: 0, diagnostics: [] });
  write('apps/web/src/example.ts', 'typeof value === "string";');
  expect(lint().status).toBe(1);
  expect(lint(true).status).toBe(1);
});

it('explicit config and --no-ignore prevent nested config and eslintignore bypasses', () => {
  write('apps/web/src/example.ts', "Reflect.get(value, 'id');");
  write('apps/web/.oxlintrc.json', '{"rules":{"anti-slop/no-reflect-get":"off"}}');
  write('.eslintignore', 'apps/**\n');
  expect(lint()).toHaveProperty('diagnostics.0.code', 'anti-slop(no-reflect-get)');
});
