import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect, createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { Schema } from 'effect';

const children = new Set<ChildProcessWithoutNullStreams>();

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address()).port;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function startApi(port: string) {
  const env = { ...process.env };
  env.PORT = port;
  const child = spawn(process.execPath, ['apps/api/src/server.ts'], {
    env,
    stdio: 'pipe',
  });
  children.add(child);
  const output: string[] = [];
  child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  return { child, output };
}

async function waitForListening(child: ChildProcessWithoutNullStreams, output: string[]) {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      child.off('error', fail);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = () => {
      if (output.join('').includes('api listening')) {
        cleanup();
        resolve();
      }
    };
    const onExit = () => fail(new Error(`API exited before listening: ${output.join('')}`));
    const timer = setTimeout(
      () => fail(new Error(`API startup timed out: ${output.join('')}`)),
      3_000,
    );
    child.stdout.on('data', onData);
    child.once('exit', onExit);
    child.once('error', fail);
  });
}

// The server logs before Node finishes binding its socket.
async function waitForSocket(port: number, deadline = Date.now() + 3_000): Promise<void> {
  const socket = connect(port, '127.0.0.1');
  try {
    await once(socket, 'connect');
  } catch (error) {
    if (Date.now() >= deadline) throw error;
    await delay(10);
    return waitForSocket(port, deadline);
  } finally {
    socket.destroy();
  }
}

afterEach(async () => {
  await Promise.all(
    [...children].map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2_000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  children.clear();
});

describe('the API over real HTTP', () => {
  it.each([
    [
      'trims the name',
      'greeting.greet',
      { name: '  Ada  ' },
      200,
      { result: { data: { message: 'Hello, Ada!' } } },
    ],
    [
      'rejects a blank name',
      'greeting.greet',
      { name: '   ' },
      400,
      { error: { data: { code: 'BAD_REQUEST' } } },
    ],
    [
      'rejects an unknown procedure',
      'unknown',
      { name: 'Ada' },
      404,
      { error: { data: { code: 'NOT_FOUND' } } },
    ],
  ])('%s', async (_description, procedure, input, status, body) => {
    const port = await freePort();
    const { child, output } = startApi(String(port));
    await waitForListening(child, output);
    await waitForSocket(port);
    const response = await fetch(
      `http://127.0.0.1:${port}/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject(body);
  });

  it('exits with an error before listening when PORT is invalid', async () => {
    const { child, output } = startApi('abc');
    const [code, signal] = await once(child, 'close');
    expect(signal).toBeNull();
    expect(code).not.toBeNull();
    expect(code).not.toBe(0);
    expect(output.join('')).not.toContain('api listening');
  });
});
