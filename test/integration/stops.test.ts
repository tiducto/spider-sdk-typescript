import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { SpiderClient } from '../../src/index.ts';
import type { FetchLike } from '../../src/http.ts';
import { startMock, type MockServer } from './support.ts';

let mock: MockServer;

before(async () => {
  mock = await startMock('test/fixtures/stops-openapi.json', 4020);
});

after(async () => {
  await mock?.stop();
});

test('search sends a contract-valid request body — prism 422s otherwise', async () => {
  const client = new SpiderClient(mock.url, 'any-key');

  const result = await client.stops.search({ name: 'central', city: 'Brno' });

  if (!result.isSuccess) {
    throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  }
});

test('search decodes a schema-conformant response into Stop objects', async () => {
  const client = new SpiderClient(mock.url, 'any-key');

  const result = await client.stops.search({ name: 'central' });

  assert.equal(result.isSuccess, true);
  const stops = result.data ?? [];
  assert.ok(stops.length >= 1, 'static mock always returns one schema-derived hit');
  for (const stop of stops) {
    assert.equal(typeof stop.gtfsId, 'string');
    assert.equal(typeof stop.name, 'string');
    for (const nullable of [stop.lat, stop.lon] as const) {
      assert.ok(nullable === null || typeof nullable === 'number');
    }
    for (const nullable of [stop.country, stop.region, stop.district, stop.city, stop.suburb] as const) {
      assert.ok(nullable === null || typeof nullable === 'string');
    }
  }
});

test('a real 401 from the gateway maps to the unauthorized error code', async () => {
  const withoutApikey: FetchLike = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete('apikey');
    return fetch(input as RequestInfo, { ...init, headers });
  };
  const client = new SpiderClient(mock.url, 'any-key', { fetch: withoutApikey });

  const result = await client.stops.search({ name: 'central' });

  assert.equal(result.isSuccess, false);
  assert.equal(result.error?.code, 'unauthorized');
});
