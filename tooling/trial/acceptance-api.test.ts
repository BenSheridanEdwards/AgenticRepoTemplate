/** @jest-environment node */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '../..');
const requireApi = createRequire(join(repository, 'apps/api/package.json'));
const { initTRPC } = requireApi('@trpc/server');
const { createHTTPServer } = requireApi('@trpc/server/adapters/standalone');
const { Schema } = requireApi('effect');

function fixture(brief: string, variant: string) {
  const trpc = initTRPC.create();
  const items = new Map();
  const id = Schema.Struct({ id: Schema.String });
  const title = Schema.Trim.check(Schema.isNonEmpty());
  const create = Schema.Struct(brief === 'notes' ? { title, body: Schema.String } : { title });
  const list = trpc.procedure.input(Schema.toStandardSchemaV1(Schema.Undefined));
  const add = trpc.procedure.input(Schema.toStandardSchemaV1(create));
  const byId = trpc.procedure.input(Schema.toStandardSchemaV1(id));

  const toggleInput =
    variant === 'set-completed'
      ? Schema.Struct({ id: Schema.String, completed: Schema.Boolean })
      : id;

  const toggle = trpc.procedure
    .input(Schema.toStandardSchemaV1(toggleInput))
    .mutation(({ input: value }) => {
      const item = items.get(value.id);
      const updated = { ...item, completed: !item.completed };
      items.set(item.id, updated);

      return variant === 'toggle-id' ? value : updated;
    });

  const procedures = {
    list: list.query(() => [...items.values()]),
    create: add.mutation(({ input: value }) => {
      const fields = brief === 'todo' ? { ...value, completed: false } : value;
      const item = { id: randomUUID(), ...fields };
      items.set(item.id, item);

      return item;
    }),
    delete: byId.mutation(({ input: value }) => {
      const item = items.get(value.id);
      items.delete(value.id);

      return variant === 'delete-item' ? item : variant === 'delete-null' ? null : value;
    }),
  };

  return createHTTPServer({
    basePath: '/trpc/',
    router: trpc.router({
      [brief === 'todo' ? 'todos' : 'notes']: trpc.router(
        brief === 'todo' ? { ...procedures, toggle } : procedures,
      ),
    }),
  });
}

it.each([
  ['todo', 'conforming', 0],
  ['notes', 'conforming', 0],
  ['todo', 'delete-item', 1],
  ['notes', 'delete-item', 1],
  ['todo', 'delete-null', 1],
  ['notes', 'delete-null', 1],
  ['todo', 'set-completed', 1],
  ['todo', 'toggle-id', 1],
])(
  'the fixed %s API contract observes %s',
  async (brief, variant, expected) => {
    const root = mkdtempSync(join(tmpdir(), 'acceptance-api-'));
    const server = fixture(String(brief), String(variant));
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const config = join(root, 'playwright.config.mjs');
    writeFileSync(
      config,
      `export default ${JSON.stringify({
        testDir: join(repository, 'tooling/trial/acceptance'),
        testMatch: `${brief}.spec.ts`,
        outputDir: join(root, 'results'),
        workers: 1,
        retries: 0,
        reporter: 'list',
        use: { baseURL: `http://127.0.0.1:${server.address().port}` },
      })};`,
    );
    const env = { ...process.env };
    delete env.JEST_WORKER_ID;

    try {
      const result = await new Promise<{ code: number; output: string }>((done) => {
        execFile(
          process.execPath,
          [
            join(repository, 'node_modules/@playwright/test/cli.js'),
            'test',
            '--config',
            config,
            '--grep',
            'API contract',
          ],
          { cwd: root, env },
          (error, stdout, stderr) =>
            done({ code: error ? Number(error.code) : 0, output: stdout + stderr }),
        );
      });

      expect(result.output).toContain('returns exact list/create/toggle/delete bodies over /trpc');

      if (expected === 1) {
        expect(result.output).toMatch(/Error: expect\(received\)\.to(?:Be|Equal)\(expected\)/);
      }

      expect(result.output).toMatch(expected === 0 ? /[1-9]\d* passed/ : /[1-9]\d* failed/);
      expect(result.code).toBe(expected);
    } finally {
      await new Promise<void>((done) => server.close(done));
      rmSync(root, { recursive: true, force: true });
    }
  },
  60_000,
);
