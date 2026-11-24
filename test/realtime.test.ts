import test from 'node:test';
import assert from 'node:assert/strict';
import { SpiderClient, delayFor, tripUpdateFor, pollTripUpdates, pollVehicleForTrip } from '../src/index.ts';
import { mockFetch } from './support.ts';

test('vehicles maps positions, missing and freshness', async () => {
  const mock = mockFetch({
    json: {
      vehicles: [{ tripId: '1:39822', serviceDate: '2026-07-19', latitude: 49.1, longitude: 16.6, occupancyStatus: 'FULL', timestamp: 1000 }],
      missing: ['1:39823'],
      feedTimestamp: 2000,
      staleSeconds: 5,
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicles('2026-07-19', ['1:39822', '1:39823']);

  assert.equal(mock.calls[0].url, 'https://x/realtime/v1/vehicles?serviceDate=2026-07-19&tripIds=1%3A39822%2C1%3A39823');
  assert.equal(mock.calls[0].headers.get('apikey'), 'k');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.vehicles.length, 1);
  assert.equal(result.data.vehicles[0].tripId, '1:39822');
  assert.equal(result.data.vehicles[0].serviceDate, '2026-07-19');
  assert.equal(result.data.vehicles[0].occupancy, 'FULL');
  assert.equal(result.data.vehicles[0].timestampEpochMs, 1_000_000);
  assert.deepEqual([...result.data.missing], ['1:39823']);
  assert.equal(result.data.freshness.feedTimestampEpochMs, 2_000_000);
  assert.equal(result.data.freshness.staleSeconds, 5);
});

test('vehicles with no trip ids skips the request', async () => {
  const mock = mockFetch({ json: {} });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicles('2026-07-19', []);
  assert.equal(mock.calls.length, 0);
  assert.equal(result.isSuccess, true);
  if (result.isSuccess) assert.equal(result.data.vehicles.length, 0);
});

test('vehicleForTrip treats 404 as no vehicle reporting', async () => {
  const mock = mockFetch({ status: 404, text: 'not found' });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicleForTrip('1:39822', '2026-07-19');
  assert.equal(mock.calls[0].url, 'https://x/realtime/v1/vehicles/by-trip/1%3A39822?serviceDate=2026-07-19');
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
    const result = await client.realtime.vehicleForTrip('1:39822', '2026-07-19');
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
    const result = await client.realtime.vehicleForTrip('1:39822', '2026-07-19');
    if (!result.isSuccess) throw new Error(result.error.code);
    assert.equal(result.data.vehicle, null);
  }
});

test('vehicleForTrip sends the service date and maps the vehicle with its run', async () => {
  const mock = mockFetch({
    json: { vehicle: { tripId: '1:39822', serviceDate: '2026-07-19', latitude: 49.1, longitude: 16.6 }, feedTimestamp: 2000 },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicleForTrip('1:39822', '2026-07-19');

  assert.equal(mock.calls[0].url, 'https://x/realtime/v1/vehicles/by-trip/1%3A39822?serviceDate=2026-07-19');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.vehicle?.tripId, '1:39822');
  assert.equal(result.data.vehicle?.serviceDate, '2026-07-19');
});

test('vehicles and vehicleForTrip reject a malformed service date as bad_request without a request', async () => {
  const mock = mockFetch({ json: { vehicles: [], missing: [] } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  for (const serviceDate of ['20260719', '2026-02-30', '']) {
    for (const result of [
      await client.realtime.vehicles(serviceDate, ['1:39822']),
      await client.realtime.vehicles(serviceDate, []),
      await client.realtime.vehicleForTrip('1:39822', serviceDate),
    ]) {
      assert.equal(result.isSuccess, false, serviceDate);
      if (!result.isSuccess) {
        assert.equal(result.error.code, 'bad_request');
        assert.equal(result.error.field, 'serviceDate');
      }
    }
  }
  assert.equal(mock.calls.length, 0);
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

test('delayFor finds a trip in the flat delays and is null for one the feed did not report', async () => {
  const mock = mockFetch({
    json: {
      serviceDate: '2026-07-19',
      delays: [
        { tripId: '1:T1', delaySeconds: 60, stopTimeUpdates: [] },
        { tripId: '1:T2', delaySeconds: 120, stopTimeUpdates: [] },
      ],
      missing: ['1:T10'],
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.delays('2026-07-19', ['1:T1', '1:T2', '1:T10']);
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(delayFor(result.data, '1:T2')?.delaySeconds, 120);
  assert.equal(delayFor(result.data, '1:T10'), null);
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

  const result = await client.realtime.vehicles('2026-07-19', ids(51));
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'tripIds');
    assert.equal(result.error.message, 'tripIds is out of range');
  }
  assert.equal(mock.calls.length, 0);

  await client.realtime.vehicles('2026-07-19', ids(50));
  assert.equal(mock.calls.length, 1);
});

test('a realtime 400 naming a field is bad_request on that field', async () => {
  const mock = mockFetch({ status: 400, text: 'tripIds is out of range' });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicles('2026-07-19', ['1:39822']);
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'tripIds');
  }
});

test('vehicles maps the run start time, wheelchair access and on-board features', async () => {
  const mock = mockFetch({
    json: {
      vehicles: [
        {
          tripId: '1:39822', serviceDate: '2026-07-19', startTime: '25:10:00', latitude: 49.1, longitude: 16.6,
          wheelchairAccessible: 'WHEELCHAIR_ACCESSIBLE', airConditioning: true, wifi: false, cardPayment: true,
        },
        { tripId: '1:39823', serviceDate: '2026-07-19', latitude: 49.2, longitude: 16.7, wheelchairAccessible: 'WHEELCHAIR_INACCESSIBLE' },
        { tripId: '1:39824', serviceDate: '2026-07-19', latitude: 49.3, longitude: 16.8, wheelchairAccessible: 'UNKNOWN' },
        { tripId: '1:39825', serviceDate: '2026-07-19', latitude: 49.4, longitude: 16.9, wheelchairAccessible: 'SOMETHING_NEW' },
      ],
      missing: [],
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.vehicles('2026-07-19', ['1:39822', '1:39823', '1:39824', '1:39825']);

  if (!result.isSuccess) throw new Error(result.error.code);
  const [first, second, third, fourth] = result.data.vehicles;
  assert.equal(first.startTime, '25:10:00');
  assert.equal(first.wheelchairAccessible, 'POSSIBLE');
  assert.equal(first.airConditioning, true);
  assert.equal(first.wifi, false);
  assert.equal(first.cardPayment, true);
  assert.equal(second.startTime, null);
  assert.equal(second.wheelchairAccessible, 'NOT_POSSIBLE');
  assert.equal(second.airConditioning, null);
  assert.equal(second.wifi, null);
  assert.equal(second.cardPayment, null);
  assert.equal(third.wheelchairAccessible, null);
  assert.equal(fourth.wheelchairAccessible, 'UNKNOWN');
});

test('vehicleForTrip sends startTime only when set, and rejects a malformed one without a request', async () => {
  const mock = mockFetch({ json: { vehicle: { tripId: '1:F1', serviceDate: '2026-07-19', startTime: '08:10:00', latitude: 49.1, longitude: 16.6 } } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.realtime.vehicleForTrip('1:F1', '2026-07-19', '8:10:00');
  await client.realtime.vehicleForTrip('1:F1', '2026-07-19', '');
  await client.realtime.vehicleForTrip('1:F1', '2026-07-19');

  assert.equal(mock.calls[0].url, 'https://x/realtime/v1/vehicles/by-trip/1%3AF1?serviceDate=2026-07-19&startTime=8%3A10%3A00');
  assert.equal(mock.calls[1].url, 'https://x/realtime/v1/vehicles/by-trip/1%3AF1?serviceDate=2026-07-19');
  assert.equal(mock.calls[2].url, 'https://x/realtime/v1/vehicles/by-trip/1%3AF1?serviceDate=2026-07-19');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.vehicle?.startTime, '08:10:00');

  for (const startTime of ['8:10', '08:60:00', '100:00:00', '08:10:00 ', 'x']) {
    const bad = await client.realtime.vehicleForTrip('1:F1', '2026-07-19', startTime);
    assert.equal(bad.isSuccess, false, startTime);
    if (!bad.isSuccess) {
      assert.equal(bad.error.code, 'bad_request');
      assert.equal(bad.error.field, 'startTime');
      assert.equal(bad.error.message, 'startTime is invalid');
    }
  }
  assert.equal(mock.calls.length, 3);
});

const TRIP_UPDATES_RESPONSE = {
  serviceDate: '2026-07-19',
  tripUpdates: [
    {
      tripId: '1:F1',
      startTime: '08:10:00',
      routeId: '1:L41',
      delaySeconds: 90,
      scheduleRelationship: 'SCHEDULED',
      stopTimeUpdates: [{ stopId: '1:U1155Z1', stopSequence: 3, departureDelay: 90 }],
      modifications: [
        {
          id: '1:detour-7',
          startTimes: ['08:10:00', '9:10:00'],
          startStop: { stopSequence: 4 },
          endStop: { stopSequence: 6, stopId: '1:U1156Z1' },
          replacementStops: [
            { stopId: '1:RT1', travelTimeToStop: 120, name: 'Detour stop', latitude: 49.2, longitude: 16.6 },
            { stopId: '1:U1157Z1', travelTimeToStop: 300 },
          ],
          propagatedModificationDelay: 180,
          alertId: '1:alert-3',
          lastModifiedTime: 1000,
          shape: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        },
      ],
    },
    { tripId: '1:F1', startTime: '09:10:00', stopTimeUpdates: [] },
    { tripId: '1:T2', delaySeconds: 60, stopTimeUpdates: [] },
  ],
  missing: ['1:T3'],
  feedTimestamp: 2000,
  staleSeconds: 4,
};

test('tripUpdates gets one service date with deduplicated, sorted, untouched ids and maps updates and modifications', async () => {
  const mock = mockFetch({ json: TRIP_UPDATES_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.tripUpdates('2026-07-19', ['1:T3', '1:F1', '1:T2', '1:T3']);

  const call = mock.calls[0];
  assert.equal(call.method, 'GET');
  const url = new URL(call.url);
  assert.equal(url.pathname, '/realtime/v1/trip-updates');
  assert.equal(url.searchParams.get('serviceDate'), '2026-07-19');
  assert.equal(url.searchParams.get('tripIds'), '1:F1,1:T2,1:T3');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.serviceDate, '2026-07-19');
  assert.deepEqual([...result.data.missing], ['1:T3']);
  assert.equal(result.data.freshness.feedTimestampEpochMs, 2_000_000);
  assert.equal(result.data.freshness.staleSeconds, 4);

  const [run1, run2, plain] = result.data.tripUpdates;
  assert.equal(run1.tripId, '1:F1');
  assert.equal(run1.startTime, '08:10:00');
  assert.equal(run1.routeId, '1:L41');
  assert.equal(run1.delaySeconds, 90);
  assert.equal(run1.scheduleRelationship, 'SCHEDULED');
  assert.equal(run1.stopTimeUpdates[0].departureDelay, 90);
  assert.equal(run1.stopTimeUpdates[0].arrivalDelay, null);

  const mod = run1.modifications[0];
  assert.equal(mod.id, '1:detour-7');
  assert.deepEqual(mod.startTimes, ['08:10:00', '9:10:00']);
  assert.deepEqual(mod.startStop, { stopSequence: 4, stopId: null });
  assert.deepEqual(mod.endStop, { stopSequence: 6, stopId: '1:U1156Z1' });
  assert.deepEqual(mod.replacementStops, [
    { stopId: '1:RT1', travelTimeToStopSeconds: 120, name: 'Detour stop', latitude: 49.2, longitude: 16.6 },
    { stopId: '1:U1157Z1', travelTimeToStopSeconds: 300, name: null, latitude: null, longitude: null },
  ]);
  assert.equal(mod.propagatedModificationDelaySeconds, 180);
  assert.equal(mod.alertId, '1:alert-3');
  assert.equal(mod.lastModifiedEpochMs, 1_000_000);
  assert.equal(mod.shape?.length, 3);
  assert.ok(Math.abs(mod.shape![0].lat - 38.5) < 1e-5);
  assert.ok(Math.abs(mod.shape![0].lon - -120.2) < 1e-5);
  assert.ok(Math.abs(mod.shape![2].lat - 43.252) < 1e-5);
  assert.ok(Math.abs(mod.shape![2].lon - -126.453) < 1e-5);

  assert.equal(run2.startTime, '09:10:00');
  assert.equal(run2.routeId, null);
  assert.equal(run2.delaySeconds, null);
  assert.deepEqual(run2.modifications, []);
  assert.equal(plain.startTime, null);
});

test('a trip modification without optional members maps them to null', async () => {
  const mock = mockFetch({
    json: {
      serviceDate: '2026-07-19',
      tripUpdates: [{ tripId: '1:T1', stopTimeUpdates: [], modifications: [{ id: '1:m', replacementStops: [], propagatedModificationDelay: 0 }] }],
      missing: [],
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.tripUpdates('2026-07-19', ['1:T1']);

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.deepEqual(result.data.tripUpdates[0].modifications[0], {
    id: '1:m',
    startTimes: null,
    startStop: null,
    endStop: null,
    replacementStops: [],
    propagatedModificationDelaySeconds: 0,
    alertId: null,
    lastModifiedEpochMs: null,
    shape: null,
  });
  assert.equal(result.data.freshness.feedTimestampEpochMs, null);
  assert.equal(result.data.freshness.staleSeconds, null);
});

test('a trip update maps its vehicle as TripVehicle, a partial one with nulls, and none as null', async () => {
  const mock = mockFetch({
    json: {
      serviceDate: '2026-07-19',
      tripUpdates: [
        {
          tripId: '1:T1',
          stopTimeUpdates: [],
          vehicle: { id: '1:7103', label: '7103', wheelchairAccessible: 'WHEELCHAIR_ACCESSIBLE', airConditioning: true, wifi: false, cardPayment: true },
        },
        { tripId: '1:T2', stopTimeUpdates: [], vehicle: { label: '7200', wheelchairAccessible: 'WHEELCHAIR_INACCESSIBLE' } },
        { tripId: '1:T3', stopTimeUpdates: [], vehicle: { id: '1:7300', wheelchairAccessible: 'UNKNOWN' } },
        { tripId: '1:T4', stopTimeUpdates: [], vehicle: {} },
        { tripId: '1:T5', stopTimeUpdates: [] },
      ],
      missing: [],
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.tripUpdates('2026-07-19', ['1:T1', '1:T2', '1:T3', '1:T4', '1:T5']);

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.deepEqual(result.data.tripUpdates.map((u) => u.vehicle), [
    { id: '1:7103', label: '7103', wheelchairAccessible: 'POSSIBLE', airConditioning: true, wifi: false, cardPayment: true },
    { id: null, label: '7200', wheelchairAccessible: 'NOT_POSSIBLE', airConditioning: null, wifi: null, cardPayment: null },
    { id: '1:7300', label: null, wheelchairAccessible: null, airConditioning: null, wifi: null, cardPayment: null },
    { id: null, label: null, wheelchairAccessible: null, airConditioning: null, wifi: null, cardPayment: null },
    null,
  ]);
});

test('tripUpdateFor finds a trip, picks a frequency run by start time compared as a time, and is null otherwise', async () => {
  const mock = mockFetch({ json: TRIP_UPDATES_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.realtime.tripUpdates('2026-07-19', ['1:F1', '1:T2', '1:T3']);
  if (!result.isSuccess) throw new Error(result.error.code);

  assert.equal(tripUpdateFor(result.data, '1:F1')?.startTime, '08:10:00');
  assert.equal(tripUpdateFor(result.data, '1:F1', '9:10:00')?.startTime, '09:10:00');
  assert.equal(tripUpdateFor(result.data, '1:F1', '10:10:00'), null);
  assert.equal(tripUpdateFor(result.data, '1:T2')?.delaySeconds, 60);
  assert.equal(tripUpdateFor(result.data, '1:T2', '08:10:00'), null);
  assert.equal(tripUpdateFor(result.data, '1:T3'), null);
});

test('tripUpdates rejects bad input as bad_request without a request', async () => {
  const mock = mockFetch({ json: {} });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `1:${i}`);
  const cases = [
    [await client.realtime.tripUpdates('20260719', ['1:39822']), 'serviceDate', 'serviceDate is invalid'],
    [await client.realtime.tripUpdates('2026-07-19', []), 'tripIds', 'tripIds is required'],
    [await client.realtime.tripUpdates('2026-07-19', ['1:39822', ' ']), 'tripIds', 'tripIds is invalid'],
    [await client.realtime.tripUpdates('2026-07-19', ids(51)), 'tripIds', 'tripIds is out of range'],
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

test('pollTripUpdates polls tripUpdates and pollVehicleForTrip passes its startTime', async () => {
  const mock = mockFetch({ json: { ...TRIP_UPDATES_RESPONSE, vehicle: undefined } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  for await (const r of pollTripUpdates(client.realtime, '2026-07-19', ['1:F1'], { intervalMs: 0 })) {
    assert.equal(r.isSuccess, true);
    break;
  }
  for await (const r of pollVehicleForTrip(client.realtime, '1:F1', '2026-07-19', { intervalMs: 0, startTime: '08:10:00' })) {
    assert.equal(r.isSuccess, true);
    break;
  }

  assert.equal(new URL(mock.calls[0].url).pathname, '/realtime/v1/trip-updates');
  assert.equal(mock.calls[1].url, 'https://x/realtime/v1/vehicles/by-trip/1%3AF1?serviceDate=2026-07-19&startTime=08%3A10%3A00');
});
