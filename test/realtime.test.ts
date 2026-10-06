import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient, delayFor } from '../src/index.ts';
import { mockFetch } from './support.ts';

test('vehicles maps positions, missing and freshness', async () => {
  const mock = mockFetch({
    json: {
      vehicles: [{ tripId: 't1', latitude: 49.1, longitude: 16.6, occupancyStatus: 'FULL', timestamp: 1000 }],
      missing: ['t2'],
      feedTimestamp: 2000,
      staleSeconds: 5,
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicles(['t1', 't2']);

  assert.equal(mock.calls[0].url, 'https://x/realtime/v1/vehicles?tripIds=t1%2Ct2');
  assert.equal(mock.calls[0].headers.get('apikey'), 'k');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.vehicles.length, 1);
  assert.equal(result.data.vehicles[0].tripId, 't1');
  assert.equal(result.data.vehicles[0].occupancy, 'FULL');
  assert.equal(result.data.vehicles[0].timestampEpochMs, 1_000_000);
  assert.deepEqual([...result.data.missing], ['t2']);
  assert.equal(result.data.freshness.feedTimestampEpochMs, 2_000_000);
  assert.equal(result.data.freshness.staleSeconds, 5);
});

test('vehicles with no trip ids skips the request', async () => {
  const mock = mockFetch({ json: {} });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicles([]);
  assert.equal(mock.calls.length, 0);
  assert.equal(result.isSuccess, true);
  if (result.isSuccess) assert.equal(result.data.vehicles.length, 0);
});

test('vehicleForTrip treats 404 as no vehicle reporting', async () => {
  const mock = mockFetch({ status: 404, text: 'not found' });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicleForTrip('t1');
  assert.equal(mock.calls[0].url, 'https://x/realtime/v1/vehicles/by-trip/t1');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.vehicle, null);
});

test('vehicleForTrip fails a 404 whose body names a plan limit, and a plain 404 stays no vehicle', async () => {
  for (const [code, message] of [
    ['planning_limit_reached', 'trip planning limit reached'],
    ['agreement_inactive', 'agreement is not active'],
  ] as const) {
    const mock = mockFetch({ status: 404, json: { error: code, message } });
    const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
    const result = await client.realtime.vehicleForTrip('t1');
    assert.equal(result.isSuccess, false, code);
    if (!result.isSuccess) {
      assert.equal(result.error.code, code);
      assert.equal(result.error.httpStatus, 404);
      assert.equal(result.error.serverCode, code);
      assert.equal(result.error.message, message);
    }
  }
  for (const reply of [{ status: 404, text: '' }, { status: 404, json: { error: 'not_found', message: 'no vehicle' } }]) {
    const client = new SpiderClient('https://x', 'k', { fetch: mockFetch(reply).fetch });
    const result = await client.realtime.vehicleForTrip('t1');
    if (!result.isSuccess) throw new Error(result.error.code);
    assert.equal(result.data.vehicle, null);
  }
});

test('delays posts grouped queries and maps per-service-date results', async () => {
  const mock = mockFetch({
    json: {
      results: [
        { serviceDate: '2026-07-19', delays: [{ tripId: 't1', delaySeconds: 120, stopTimeUpdates: [] }], missing: ['t2'] },
      ],
      feedTimestamp: null,
      staleSeconds: null,
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.delays(['t1', 't2'], '2026-07-19');

  const call = mock.calls[0];
  assert.equal(call.url, 'https://x/realtime/v1/delays');
  assert.equal(call.method, 'POST');
  assert.deepEqual(JSON.parse(call.body), { queries: [{ serviceDate: '2026-07-19', tripIds: ['t1', 't2'] }] });

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.groups.length, 1);
  const group = result.data.groups[0];
  assert.equal(group.serviceDate, '2026-07-19');
  assert.equal(group.delays[0].delaySeconds, 120);
  assert.deepEqual([...group.missing], ['t2']);
  const hit = delayFor(result.data, 't1', '2026-07-19');
  assert.equal(hit?.delaySeconds, 120);
  assert.equal(delayFor(result.data, 't2', '2026-07-19'), null);
  assert.equal(result.data.freshness.feedTimestampEpochMs, null);
});

test('delays groups multiple service dates in one request', async () => {
  const mock = mockFetch({ json: { results: [] } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.realtime.delays({ '2026-07-19': ['t1'], '2026-07-20': ['t2', 't3'] });
  assert.deepEqual(JSON.parse(mock.calls[0].body), {
    queries: [
      { serviceDate: '2026-07-19', tripIds: ['t1'] },
      { serviceDate: '2026-07-20', tripIds: ['t2', 't3'] },
    ],
  });
});

test('delays with no trip ids skips the request', async () => {
  const mock = mockFetch({ json: {} });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.delays([], '2026-07-19');
  assert.equal(mock.calls.length, 0);
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.groups.length, 0);
});

test('delays rejects a malformed service date as bad_request without a request', async () => {
  const mock = mockFetch({ json: {} });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const single = await client.realtime.delays(['t1'], '20260719');
  const grouped = await client.realtime.delays({ '2026-07-19': ['t1'], '2026-02-30': ['t2'] });

  assert.equal(mock.calls.length, 0);
  for (const result of [single, grouped]) {
    assert.equal(result.isSuccess, false);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, 'serviceDate');
    }
  }
});

test('alerts maps text and active periods', async () => {
  const mock = mockFetch({
    json: {
      alerts: [{ id: 'a1', headerText: 'H', descriptionText: 'D', activePeriods: [{ start: 1, end: 2 }], informedEntities: [] }],
      feedTimestamp: 3,
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.alerts();
  assert.equal(mock.calls[0].url, 'https://x/realtime/v1/alerts');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.alerts.length, 1);
  assert.equal(result.data.alerts[0].headerText, 'H');
  assert.equal(result.data.alerts[0].activePeriods[0].startEpochMs, 1000);
});

test('vehicles and delays reject more than 50 trip ids, counted across dates, without a request', async () => {
  const mock = mockFetch({ json: { vehicles: [], results: [] } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ids = (n: number, p = 't') => Array.from({ length: n }, (_, i) => `${p}${i}`);

  const results = [
    await client.realtime.vehicles(ids(51)),
    await client.realtime.delays(ids(51), '2026-07-19'),
    await client.realtime.delays({ '2026-07-19': ids(30, 'a'), '2026-07-20': ids(21, 'b') }),
  ];
  for (const result of results) {
    assert.equal(result.isSuccess, false);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, 'tripIds');
      assert.equal(result.error.message, 'tripIds is out of range');
    }
  }
  assert.equal(mock.calls.length, 0);

  await client.realtime.vehicles(ids(50));
  await client.realtime.delays({ '2026-07-19': ids(30, 'a'), '2026-07-20': ids(20, 'b') });
  assert.equal(mock.calls.length, 2);
});

test('a realtime 400 naming a field is bad_request on that field', async () => {
  const mock = mockFetch({ status: 400, text: 'tripIds is out of range' });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicles(['t1']);
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'tripIds');
  }
});
