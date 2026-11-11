import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient } from '../src/index.ts';
import { CONTRACT_VERSION } from '../src/contract.ts';
import { mockFetch } from './support.ts';

test('search sends q and the default limit 10 as a GET, with no location', async () => {
  const mock = mockFetch({ json: { hits: [], query: 'x' } });
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const result = await client.places.search('Vaňkovka');

  assert.equal(result.isSuccess, true);
  const call = mock.calls[0];
  assert.equal(call.method, 'GET');
  assert.equal(call.headers.get('apikey'), 'k');
  assert.equal(call.headers.get('x-spider-contract-version'), CONTRACT_VERSION);
  const url = new URL(call.url);
  assert.equal(url.origin + url.pathname, 'https://brno.api.tiducto.eu/places/v1/search');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['limit', 'q']);
  assert.equal(url.searchParams.get('q'), 'Vaňkovka');
  assert.equal(url.searchParams.get('limit'), '10');
});

test('search sends a location as latitude and longitude and encodes diacritics', async () => {
  const mock = mockFetch({ json: { hits: [], query: 'x' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.places.search('Údolní 53', { near: { lat: 49.1951, lng: 16.6068 }, limit: 5 });

  const raw = mock.calls[0].url;
  assert.ok(raw.includes('q=%C3%9Adoln%C3%AD+53'), raw);
  const params = new URL(raw).searchParams;
  assert.equal(params.get('q'), 'Údolní 53');
  assert.equal(params.get('limit'), '5');
  assert.equal(params.get('latitude'), '49.1951');
  assert.equal(params.get('longitude'), '16.6068');
});

test('hits map with their type, category, admin labels and distance; absent members are null', async () => {
  const mock = mockFetch({
    json: {
      hits: [
        {
          id: '1:U1234Z1', type: 'stop', name: 'Hlavní nádraží', lat: 49.190612, lon: 16.612951,
          country: 'Česko', region: 'Jihomoravský kraj', district: 'okres Brno-město', city: 'Brno', suburb: 'Brno-střed',
          distance: 670,
        },
        { id: 'osm-w29239083', type: 'poi', name: 'Vaňkovka', lat: 49.18904, lon: 16.614627, category: 'mall' },
        { id: 'ruian-1', type: 'address', name: 'Údolní 244/53', lat: 49.19, lon: 16.59, category: 'building' },
        { id: 'ruian-2', type: 'street', name: 'Údolní', lat: 49.19, lon: 16.59, category: 'street' },
        { id: 'ruian-3', type: 'place', name: 'Brno', lat: 49.19, lon: 16.6, category: 'municipality' },
      ],
      query: 'brno',
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.places.search('brno', { near: { lat: 49.19, lng: 16.6 } });

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.deepEqual(result.data.map((h) => h.type), ['STOP', 'POI', 'ADDRESS', 'UNKNOWN', 'PLACE']);
  assert.deepEqual(result.data[0], {
    id: '1:U1234Z1',
    type: 'STOP',
    name: 'Hlavní nádraží',
    lat: 49.190612,
    lon: 16.612951,
    category: null,
    country: 'Česko',
    region: 'Jihomoravský kraj',
    district: 'okres Brno-město',
    city: 'Brno',
    suburb: 'Brno-střed',
    distance: 670,
  });
  const poi = result.data[1];
  assert.equal(poi.category, 'mall');
  assert.equal(poi.distance, null);
  assert.equal(poi.city, null);
  assert.equal(poi.suburb, null);
});

test('a stop hit carries its stop, mapped as stop search maps it; other types carry none', async () => {
  const mock = mockFetch({
    json: {
      hits: [
        {
          id: '1:U1234Z1', type: 'stop', gtfsId: '1:U1234Z1', name: 'Hlavní nádraží', code: '1', wheelchairBoarding: 1,
          modes: ['TRAM', 'BUS', 'HOVERCRAFT'], lat: 49.190612, lon: 16.612951, city: 'Brno', distance: 670,
        },
        { id: '1:U9Z1', type: 'stop', gtfsId: '1:U9Z1', name: 'Točna', lat: 49.2, lon: 16.6 },
        { id: 'osm-w29239083', type: 'poi', name: 'Vaňkovka', lat: 49.18904, lon: 16.614627, category: 'mall' },
      ],
      query: 'hlavni',
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.places.search('hlavni');

  if (!result.isSuccess) throw new Error(result.error.code);
  const [stopHit, bareStop, poi] = result.data;
  assert.deepEqual(stopHit.stop, {
    gtfsId: '1:U1234Z1',
    name: 'Hlavní nádraží',
    code: '1',
    wheelchairBoarding: 'POSSIBLE',
    lat: 49.190612,
    lon: 16.612951,
    country: null,
    region: null,
    district: null,
    city: 'Brno',
    suburb: null,
    modes: ['TRAM', 'BUS', 'UNKNOWN'],
  });
  assert.equal(bareStop.stop?.code, null);
  assert.equal(bareStop.stop?.wheelchairBoarding, null);
  assert.deepEqual(bareStop.stop?.modes, []);
  assert.equal(poi.stop, undefined);
  assert.equal('stop' in poi, false);
});

test('an unknown type decodes to UNKNOWN and unknown keys are ignored', async () => {
  const mock = mockFetch({
    json: {
      hits: [{ id: 'x-1', type: 'district', name: 'Žabovřesky', lat: 49.2, lon: 16.57, rank: 3, extra: { a: 1 } }],
      query: 'Žabovřesky',
      took: 4,
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.places.search('Žabovřesky');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data[0].type, 'UNKNOWN');
  assert.equal(result.data[0].name, 'Žabovřesky');
  assert.equal('rank' in result.data[0], false);
});

test('search rejects a limit outside 1–20 as bad_request without a request', async () => {
  const mock = mockFetch({ json: { hits: [], query: 'x' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  for (const limit of [0, 21, 2.5, Number.NaN]) {
    const result = await client.places.search('Brno', { limit });
    assert.equal(result.isSuccess, false, String(limit));
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, 'limit');
      assert.equal(result.error.message, 'limit is out of range');
    }
  }
  assert.equal(mock.calls.length, 0);

  await client.places.search('Brno', { limit: 20 });
  assert.equal(new URL(mock.calls[0].url).searchParams.get('limit'), '20');
});

test('the error envelope maps to a typed error', async () => {
  const mock = mockFetch({ status: 400, json: { code: 'bad_request', message: 'q is out of range', field: 'q' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.places.search('x');

  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.httpStatus, 400);
    assert.equal(result.error.serverCode, 'bad_request');
    assert.equal(result.error.field, 'q');
    assert.ok(result.error.message.includes('q is out of range'));
  }
});

test('a 401 and a 429 map to unauthorized and rate_limited', async () => {
  for (const [status, code, expected] of [
    [401, 'key_invalid', 'unauthorized'],
    [429, 'rate_limited', 'rate_limited'],
  ] as const) {
    const mock = mockFetch({ status, json: { code, message: 'refused' } });
    const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
    const result = await client.places.search('Brno');
    assert.equal(result.isSuccess ? undefined : result.error.code, expected);
  }
});

test('places retries a 5xx when its surface enables autoRetry', async () => {
  let n = 0;
  const mock = mockFetch(() => (++n === 1 ? { status: 503, text: 'busy', headers: { 'retry-after': '0' } } : { json: { hits: [], query: 'x' } }));
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch, places: { autoRetry: { maxAttempts: 2 } } });

  const result = await client.places.search('Brno');

  assert.equal(result.isSuccess, true);
  assert.equal(mock.calls.length, 2);
});
