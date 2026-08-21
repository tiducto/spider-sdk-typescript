import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient } from '../src/index.ts';
import { mockFetch } from './support.ts';

test('search builds the query and filter expression and maps hits', async () => {
  const mock = mockFetch({
    json: { hits: [{ routeId: '1:L4', shortName: '4', mode: 'TRAM', routeType: 0, agencyName: 'DPMB', tripCount: 512 }], query: 'x' },
  });
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const result = await client.routes.search({ q: '4', mode: 'TRAM', agency: 'DPMB' });

  const call = mock.calls[0];
  assert.equal(call.url, 'https://brno.api.tiducto.eu/routes/search');
  assert.equal(call.method, 'POST');
  const body = JSON.parse(call.body);
  assert.equal(body.q, '4');
  assert.equal(body.filter, 'mode = "TRAM" AND agencyName = "DPMB"');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].routeId, '1:L4');
  assert.equal(result.data[0].mode, 'TRAM');
  assert.equal(result.data[0].agencyName, 'DPMB');
  assert.equal(result.data[0].tripCount, 512);
  assert.equal(result.data[0].longName, null);
});

test('search with only a query omits the filter field', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.routes.search({ q: 'abc' });
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.q, 'abc');
  assert.equal('filter' in body, false);
});

test('search combines mode and agency with AND and escapes values', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.routes.search({ mode: 'BUS', agency: 'a"b' });
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.filter, 'mode = "BUS" AND agencyName = "a\\"b"');
});

test('byId composes a quoted routeId filter and returns the first hit', async () => {
  const mock = mockFetch({ json: { hits: [{ routeId: '1:L4', shortName: '4', mode: 'TRAM', routeType: 0, tripCount: 512 }], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const route = await client.routes.byId('1:L4');

  const call = mock.calls[0];
  assert.equal(call.url, 'https://x/routes/search');
  const body = JSON.parse(call.body);
  assert.equal(body.q, '');
  assert.equal(body.filter, 'routeId = "1:L4"');
  assert.equal(body.limit, 1);
  assert.equal(route?.routeId, '1:L4');
});

test('byId returns null when there is no matching route', async () => {
  const mock = mockFetch({ json: { hits: [], query: '' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  assert.equal(await client.routes.byId('1:nope'), null);
});

test('search surfaces the server error message', async () => {
  const mock = mockFetch({ status: 400, json: { message: 'bad filter' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routes.search({ mode: 'Z' });
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'unknown');
    assert.ok(result.error.message.includes('bad filter'));
  }
});
