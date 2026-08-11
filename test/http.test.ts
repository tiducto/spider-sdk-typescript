import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transport } from '../src/http.ts';

// Regression: when no custom fetch is supplied, the Transport must invoke the global fetch with
// the global as its receiver. Browsers brand-check native fetch and reject a foreign `this` with
// "Illegal invocation"; Node's fetch does not, so this receiver bug only surfaces in the browser.
// We reproduce the browser check here with a strict stand-in installed on globalThis.
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
    const transport = new Transport('https://example.test', 'test-key'); // default-fetch branch
    const res = await transport.getRaw('/anything');
    assert.equal(res.ok, true);
    assert.equal(res.text, 'ok');
  } finally {
    globalThis.fetch = original;
  }
});
