import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Verifier } from '@pact-foundation/pact';
import { Schema } from 'effect';

async function availablePort() {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(address).port;
}

async function waitForHttp(url: string, deadline: number): Promise<void> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(500) });
  } catch (error) {
    if (Date.now() > deadline) throw error;
    await delay(10);
    return waitForHttp(url, deadline);
  }
}

it('verifies the web contract against server.ts over HTTP', async () => {
  const port = await availablePort();
  const env = { ...process.env };
  env.PORT = String(port);
  const child = spawn(process.execPath, ['apps/api/src/server.ts'], {
    env,
    stdio: 'pipe',
  });
  const output: string[] = [];
  child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  try {
    const url = `http://127.0.0.1:${port}`;
    await waitForHttp(url, Date.now() + 3_000);
    expect(output.join('')).toContain('api listening');
    const directory = process.env.PACT_DIR ?? join(tmpdir(), 'art-pact');
    const pactUrls = readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .map((file) => join(directory, file));
    expect(pactUrls.length).toBeGreaterThan(0);
    await new Verifier({ provider: 'api', providerBaseUrl: url, pactUrls }).verifyProvider();
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2_000);
      try {
        await closed;
      } finally {
        clearTimeout(timer);
      }
    }
  }
}, 30_000);
