import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient } from '../src/index.ts';
import type { FetchLike } from '../src/http.ts';
import { CONTRACT_VERSION } from '../src/contract.ts';
import { mockFetch } from './support.ts';

test('exposes the three surfaces and the contract version', () => {
  const client = new SpiderClient('https://x', 'k');
  assert.equal(client.contractVersion, CONTRACT_VERSION);
  assert.ok(client.routing);
  assert.ok(client.stops);
  assert.ok(client.realtime);
});

test('strips a trailing slash from the base url', async () => {
  const client = new SpiderClient('https://x/', 'k');
  assert.ok(client.routing);
});

test('warmup pre-warms the connection with one keyless GET /ping', async () => {
  const mock = mockFetch({ status: 200, text: 'pong' });
  const client = new SpiderClient('https://x', 'secret-key', { fetch: mock.fetch });
  const ms = await client.warmup();

  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].method, 'GET');
  assert.equal(mock.calls[0].url, 'https://x/ping');
  // /ping is keyless — no apikey must ride the warm-up request.
  assert.equal(mock.calls[0].headers.get('apikey'), null);
  assert.equal(typeof ms, 'number');
  assert.ok(ms >= 0);
});

test('warmup treats a 404 (route not yet deployed) as a successful warm-up', async () => {
  const mock = mockFetch({ status: 404, text: 'not found' });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ms = await client.warmup();

  assert.equal(mock.calls.length, 1);
  assert.equal(typeof ms, 'number');
  assert.ok(ms >= 0);
});

test('warmup never rejects — a failing /ping still returns the elapsed time', async () => {
  const failing: FetchLike = () => Promise.reject(new Error('network down'));
  const client = new SpiderClient('https://x', 'k', { fetch: failing });
  const ms = await client.warmup();

  assert.equal(typeof ms, 'number');
  assert.ok(ms >= 0);
});
