import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface MockServer {
  readonly url: string;
  stop(): Promise<void>;
}

export async function startMock(spec: string, port: number): Promise<MockServer> {
  const bin = join(root, 'node_modules', '.bin', 'prism');
  const child = spawn(
    bin,
    ['mock', '--host', '127.0.0.1', '--port', String(port), join(root, spec)],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let log = '';
  child.stdout.on('data', (chunk: Buffer) => (log += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (log += chunk.toString()));

  const url = `http://127.0.0.1:${port}`;
  await waitForReady(url, child, () => log);

  return {
    url,
    async stop() {
      if (child.exitCode == null) {
        child.kill('SIGTERM');
        await once(child, 'exit');
      }
    },
  };
}

async function waitForReady(
  url: string,
  child: ChildProcess,
  log: () => string,
  timeoutMs = 45_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`prism exited early (${child.exitCode}):\n${log()}`);
    }
    try {
      await fetch(url, { signal: AbortSignal.timeout(1_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  child.kill('SIGTERM');
  throw new Error(`prism did not start listening on ${url} within ${timeoutMs}ms:\n${log()}`);
}
