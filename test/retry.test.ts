import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient } from '../src/index.ts';
import { mockFetch } from './support.ts';

test('autoRetry retries a 503 then succeeds', async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n += 1;
    return n === 1
      ? { status: 503, text: 'busy', headers: { 'retry-after': '0' } }
      : { json: { alerts: [], feedTimestamp: null, staleSeconds: null } };
  });
  const client = new SpiderClient('https://x', 'k', {
    fetch: mock.fetch,
    realtime: { autoRetry: { maxAttempts: 3 } },
  });

  const result = await client.realtime.alerts();
  assert.equal(mock.calls.length, 2);
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.alerts.length, 0);
});

test('without autoRetry a 503 is not retried', async () => {
  const mock = mockFetch({ status: 503, text: 'busy' });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.realtime.alerts();
  assert.equal(mock.calls.length, 1);
  assert.equal(result.isSuccess, false);
});

test('autoRetry gives up after maxAttempts and fails', async () => {
  const mock = mockFetch({ status: 503, text: 'busy', headers: { 'retry-after': '0' } });
  const client = new SpiderClient('https://x', 'k', {
    fetch: mock.fetch,
    realtime: { autoRetry: { maxAttempts: 2 } },
  });

  const result = await client.realtime.alerts();
  assert.equal(mock.calls.length, 2);
  assert.equal(result.isSuccess, false);
});
