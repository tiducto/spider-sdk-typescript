import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transport } from '../src/http.ts';

// The bug is browser-only — browsers reject native fetch called with a foreign `this`
// ("Illegal invocation") but Node's fetch doesn't brand-check — so we install a strict
// stand-in on globalThis to reproduce the browser's check here.
test('default fetch is invoked with the global as receiver (no Illegal invocation)', async () => {
  const original = globalThis.fetch;
  const strict = function (this: unknown): Promise<Response> {
    if (this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    return Promise.resolve(new Response('ok', { status: 200 }));
  };
  globalThis.fetch = strict as unknown as typeof fetch;
  try {
    const transport = new Transport('https://example.test', 'test-key');
    const res = await transport.getRaw('/anything');
    assert.equal(res.ok, true);
    assert.equal(res.text, 'ok');
  } finally {
    globalThis.fetch = original;
  }
});
