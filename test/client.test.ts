import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient } from '../src/index.ts';
import { CONTRACT_VERSION } from '../src/contract.ts';

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
