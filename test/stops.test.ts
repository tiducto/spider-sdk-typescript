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
  assert.equal(body.filter, '"city" = "Brno"');

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
  assert.equal(body.filter, '"region" = "a\\"b" AND "city" = "Brno"');
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
