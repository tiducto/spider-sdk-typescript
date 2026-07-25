import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient } from '../src/index.ts';
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

  assert.equal(mock.calls[0].url, 'https://x/realtime/vehicles?tripIds=t1%2Ct2');
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
  assert.equal(mock.calls[0].url, 'https://x/realtime/vehicles/by-trip/t1');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.vehicle, null);
});

test('delays maps trip-level deviations', async () => {
  const mock = mockFetch({
    json: { delays: [{ tripId: 't1', delaySeconds: 120, stopTimeUpdates: [] }], missing: [], feedTimestamp: null, staleSeconds: null },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.delays(['t1']);
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.delays.length, 1);
  assert.equal(result.data.delays[0].delaySeconds, 120);
  assert.equal(result.data.freshness.feedTimestampEpochMs, null);
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
  assert.equal(mock.calls[0].url, 'https://x/realtime/alerts');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.alerts.length, 1);
  assert.equal(result.data.alerts[0].headerText, 'H');
  assert.equal(result.data.alerts[0].activePeriods[0].startEpochMs, 1000);
});
