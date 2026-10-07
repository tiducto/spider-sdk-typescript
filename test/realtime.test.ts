import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient } from '../src/index.ts';
import { mockFetch } from './support.ts';

test('vehicles maps positions, missing and freshness', async () => {
  const mock = mockFetch({
    json: {
      vehicles: [{ tripId: '1:39822', latitude: 49.1, longitude: 16.6, occupancyStatus: 'FULL', timestamp: 1000 }],
      missing: ['1:39823'],
      feedTimestamp: 2000,
      staleSeconds: 5,
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicles(['1:39822', '1:39823']);

  assert.equal(mock.calls[0].url, 'https://x/realtime/v1/vehicles?tripIds=1%3A39822%2C1%3A39823');
  assert.equal(mock.calls[0].headers.get('apikey'), 'k');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.vehicles.length, 1);
  assert.equal(result.data.vehicles[0].tripId, '1:39822');
  assert.equal(result.data.vehicles[0].occupancy, 'FULL');
  assert.equal(result.data.vehicles[0].timestampEpochMs, 1_000_000);
  assert.deepEqual([...result.data.missing], ['1:39823']);
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
  const result = await client.realtime.vehicleForTrip('1:39822');
  assert.equal(mock.calls[0].url, 'https://x/realtime/v1/vehicles/by-trip/1%3A39822');
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
    const result = await client.realtime.vehicleForTrip('1:39822');
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
    const result = await client.realtime.vehicleForTrip('1:39822');
    if (!result.isSuccess) throw new Error(result.error.code);
    assert.equal(result.data.vehicle, null);
  }
});

test('delays gets one service date with deduplicated, sorted, untouched ids and maps the flat response', async () => {
  const mock = mockFetch({
    json: {
      serviceDate: '2026-07-19',
      delays: [{ tripId: '1:39822', routeId: '1:L41', delaySeconds: 120, stopTimeUpdates: [{ stopId: '1:U1155Z1', arrivalDelay: 120 }] }],
      missing: ['1:39823'],
      feedTimestamp: 2000,
      staleSeconds: 4,
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.delays('2026-07-19', ['1:39823', '1:39822', '1:39823']);

  const call = mock.calls[0];
  assert.equal(call.method, 'GET');
  const url = new URL(call.url);
  assert.equal(url.pathname, '/realtime/v1/delays');
  assert.equal(url.searchParams.get('serviceDate'), '2026-07-19');
  assert.equal(url.searchParams.get('tripIds'), '1:39822,1:39823');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.serviceDate, '2026-07-19');
  assert.equal(result.data.delays.length, 1);
  assert.equal(result.data.delays[0].tripId, '1:39822');
  assert.equal(result.data.delays[0].delaySeconds, 120);
  assert.equal(result.data.delays[0].stopTimeUpdates[0].stopId, '1:U1155Z1');
  assert.equal(result.data.delays[0].scheduleRelationship, null);
  assert.deepEqual([...result.data.missing], ['1:39823']);
  assert.equal(result.data.freshness.feedTimestampEpochMs, 2_000_000);
  assert.equal(result.data.freshness.staleSeconds, 4);
});

test('delays sorts ids by code unit, so equal requests share one URL', async () => {
  const mock = mockFetch({ json: { serviceDate: '2026-07-19', delays: [], missing: [] } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.realtime.delays('2026-07-19', ['1:b', '1:B', '1:a', '10:a', '1:ä']);
  await client.realtime.delays('2026-07-19', ['1:ä', '10:a', '1:a', '1:B', '1:b', '1:a']);
  assert.equal(new URL(mock.calls[0].url).searchParams.get('tripIds'), '10:a,1:B,1:a,1:b,1:ä');
  assert.equal(mock.calls[0].url, mock.calls[1].url);
});

test('delays leaves freshness null when the feed has not reported', async () => {
  const mock = mockFetch({ json: { serviceDate: '2026-07-19', delays: [], missing: ['1:39822'] } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.delays('2026-07-19', ['1:39822']);
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.freshness.feedTimestampEpochMs, null);
  assert.equal(result.data.freshness.staleSeconds, null);
});

test('delays rejects bad input as bad_request without a request', async () => {
  const mock = mockFetch({ json: {} });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `1:${i}`);
  const cases = [
    [await client.realtime.delays('20260719', ['1:39822']), 'serviceDate', 'serviceDate is invalid'],
    [await client.realtime.delays('2026-02-30', ['1:39822']), 'serviceDate', 'serviceDate is invalid'],
    [await client.realtime.delays('2026-07-19', []), 'tripIds', 'tripIds is required'],
    [await client.realtime.delays('2026-07-19', ['1:39822', '']), 'tripIds', 'tripIds is invalid'],
    [await client.realtime.delays('2026-07-19', ['1:39822', ' ']), 'tripIds', 'tripIds is invalid'],
    [await client.realtime.delays('2026-07-19', ids(51)), 'tripIds', 'tripIds is out of range'],
  ] as const;
  assert.equal(mock.calls.length, 0);
  for (const [result, field, message] of cases) {
    assert.equal(result.isSuccess, false, message);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, field);
      assert.equal(result.error.message, message);
    }
  }
});

test('delays counts distinct ids against the limit of 50', async () => {
  const mock = mockFetch({ json: { serviceDate: '2026-07-19', delays: [], missing: [] } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ids = Array.from({ length: 50 }, (_, i) => `1:${i}`);
  const result = await client.realtime.delays('2026-07-19', [...ids, ...ids]);
  assert.equal(result.isSuccess, true);
  assert.equal(new URL(mock.calls[0].url).searchParams.get('tripIds')?.split(',').length, 50);
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

test('vehicles rejects more than 50 trip ids without a request', async () => {
  const mock = mockFetch({ json: { vehicles: [], missing: [] } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `1:${i}`);

  const result = await client.realtime.vehicles(ids(51));
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'tripIds');
    assert.equal(result.error.message, 'tripIds is out of range');
  }
  assert.equal(mock.calls.length, 0);

  await client.realtime.vehicles(ids(50));
  assert.equal(mock.calls.length, 1);
});

test('a realtime 400 naming a field is bad_request on that field', async () => {
  const mock = mockFetch({ status: 400, text: 'tripIds is out of range' });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicles(['1:39822']);
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'tripIds');
  }
});
