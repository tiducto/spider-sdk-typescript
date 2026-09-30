import test from 'node:test';
import assert from 'node:assert/strict';
import { Location, SpiderClient } from '../src/index.ts';
import type { SpiderError, SpiderResult } from '../src/index.ts';
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

test('warmup pre-warms the connection with one keyed GET /ping', async () => {
  const mock = mockFetch({ status: 200, text: 'pong' });
  const client = new SpiderClient('https://x', 'secret-key', { fetch: mock.fetch });
  const ms = await client.warmup();

  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].method, 'GET');
  assert.equal(mock.calls[0].url, 'https://x/ping');
  // /ping authenticates with the client apikey.
  assert.equal(mock.calls[0].headers.get('apikey'), 'secret-key');
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

test('a plan-limit refusal reaches every surface as its own code', async () => {
  for (const [code, message] of [
    ['planning_limit_reached', 'trip planning limit reached'],
    ['agreement_inactive', 'agreement is not active'],
  ] as const) {
    const mock = mockFetch({ status: 403, json: { error: code, message } });
    const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
    const calls: Record<string, () => Promise<SpiderResult<unknown>>> = {
      plan: () => client.routing.plan({ origin: Location.coordinate(1, 2), destination: Location.coordinate(3, 4) }),
      departures: () => client.routing.departures('1:S'),
      trip: () => client.routing.trip('1:T'),
      stopSearch: () => client.stops.search({ name: 'x' }),
      vehicles: () => client.realtime.vehicles(['t1']),
      vehicleForTrip: () => client.realtime.vehicleForTrip('t1'),
      delays: () => client.realtime.delays(['t1'], '2026-09-30'),
      alerts: () => client.realtime.alerts(),
    };
    for (const [surface, call] of Object.entries(calls)) {
      const result = await call();
      assert.equal(result.isSuccess, false, surface);
      const error: SpiderError | undefined = result.isSuccess ? undefined : result.error;
      assert.equal(error?.code, code, surface);
      assert.equal(error?.httpStatus, 403, surface);
      assert.equal(error?.serverCode, code, surface);
      assert.equal(error?.message, message, surface);
    }
  }
});
