import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient } from '../src/index.ts';
import { mockFetch } from './support.ts';

test('search builds the query and filter expression and maps hits', async () => {
  const mock = mockFetch({
    json: { hits: [{ gtfsId: 'g1', name: 'Hlavní nádraží', lat: 49.19, lon: 16.61, city: 'Brno', region: 'JMK' }], query: 'x' },
  });
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const result = await client.stops.search({ name: 'Hlavní', city: 'Brno' });

  const call = mock.calls[0];
  assert.equal(call.url, 'https://brno.api.tiducto.eu/stops/search');
  assert.equal(call.method, 'POST');
  const body = JSON.parse(call.body);
  assert.equal(body.q, 'Hlavní');
  assert.equal(body.filter, 'city = "Brno"');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].gtfsId, 'g1');
  assert.equal(result.data[0].city, 'Brno');
  assert.equal(result.data[0].region, 'JMK');
  assert.equal(result.data[0].district, null);
});

test('search with only a name omits the filter field', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.stops.search({ name: 'abc' });
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.q, 'abc');
  assert.equal('filter' in body, false);
});

test('search combines multiple admin levels with AND and escapes values', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.stops.search({ city: 'Brno', region: 'a"b' });
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.filter, 'region = "a\\"b" AND city = "Brno"');
});

test('byId composes a quoted gtfsId filter and returns the first hit', async () => {
  const mock = mockFetch({ json: { hits: [{ gtfsId: '1:39822', name: 'Zvonařka', lat: 49.18, lon: 16.62 }], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const stop = await client.stops.byId('1:39822');

  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.q, '');
  assert.equal(body.filter, 'gtfsId = "1:39822"');
  assert.equal(body.limit, 1);
  assert.equal(stop?.gtfsId, '1:39822');
});

test('byId returns null when there is no matching stop', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  assert.equal(await client.stops.byId('1:nope'), null);
});

test('near composes a _geoRadius filter and a distance sort', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.stops.near(49.19, 16.61, { radiusMeters: 500, limit: 20 });

  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.q, '');
  assert.equal(body.filter, '_geoRadius(49.19, 16.61, 500)');
  assert.deepEqual(body.sort, ['_geoPoint(49.19, 16.61):asc']);
  assert.equal(body.limit, 20);
});

test('within composes a _geoBoundingBox filter (NE corner first, SW second)', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.stops.within({ minLat: 49.1, minLng: 16.5, maxLat: 49.3, maxLng: 16.7 }, { limit: 5 });

  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.filter, '_geoBoundingBox([49.3, 16.7], [49.1, 16.5])');
  assert.equal(body.limit, 5);
  assert.equal('sort' in body, false);
});

test('search combines admin, radius and distance sort in one request', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.stops.search({ city: 'Brno', near: { lat: 49.19, lng: 16.61 }, radiusMeters: 800, sortByDistance: true });

  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.filter, 'city = "Brno" AND _geoRadius(49.19, 16.61, 800)');
  assert.deepEqual(body.sort, ['_geoPoint(49.19, 16.61):asc']);
});

test('search rejects radiusMeters without near', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await assert.rejects(() => client.stops.search({ radiusMeters: 500 }), /requires `near`/);
});

test('search surfaces the server error message', async () => {
  const mock = mockFetch({ status: 400, json: { message: 'bad filter' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.stops.search({ region: 'Z' });
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'unknown');
    assert.ok(result.error.message.includes('bad filter'));
  }
});
