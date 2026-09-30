import test from 'node:test';
import assert from 'node:assert/strict';
import { Location, SpiderClient, ViaLocation } from '../src/index.ts';
import { CONTRACT_VERSION } from '../src/contract.ts';
import { SDK_IDENTITY } from '../src/sdk.ts';
import { DEPARTURES, PLAN } from '../src/persistedQueries.ts';
import { mockFetch } from './support.ts';

const PLAN_ENVELOPE = {
  data: {
    planConnection: {
      edges: [
        {
          cursor: 'c1',
          node: {
            start: '2026-07-20T08:00:00Z',
            end: '2026-07-20T08:30:00Z',
            duration: 1800,
            waitingTime: 120,
            numberOfTransfers: 1,
            accessibilityScore: 0.9,
            legs: [
              {
                mode: 'TRAM',
                start: { scheduledTime: '2026-07-20T08:00:00Z', estimated: { time: '2026-07-20T08:02:00Z', delay: 'PT120S' } },
                end: { scheduledTime: '2026-07-20T08:15:00Z', estimated: { time: '2026-07-20T08:16:00Z', delay: 'PT60S' } },
                realtimeState: 'UPDATED',
                realTime: true,
                serviceDate: '2026-07-20',
                from: { name: 'A', stop: { gtfsId: '1:A', wheelchairBoarding: 'POSSIBLE', platformCode: '2', zoneId: '100' } },
                to: { name: 'B', stop: { gtfsId: '1:B', wheelchairBoarding: 'NOT_POSSIBLE', platformCode: 'B', zoneId: '101' } },
                route: { gtfsId: '1:L1', shortName: '1', longName: 'Line 1', color: 'FF0000', textColor: 'FFFFFF' },
                headsign: 'Center',
                distance: 1200.5,
                duration: 900,
                accessibilityScore: 1,
                trip: { gtfsId: '1:trip', bikesAllowed: 'ALLOWED' },
                legGeometry: { points: '_p~iF~ps|U' },
              },
            ],
          },
        },
      ],
      pageInfo: { startCursor: 'c1', endCursor: 'c1', hasNextPage: true, hasPreviousPage: false, searchWindowUsed: 'PT1H' },
      routingErrors: [],
      searchDateTime: '2026-07-20T08:00:00Z',
    },
  },
};

test('plan posts the persisted query and maps the route', async () => {
  const mock = mockFetch({ json: PLAN_ENVELOPE });
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({
    origin: Location.coordinate(49.19, 16.61),
    destination: Location.coordinate(49.23, 16.53),
  });

  assert.equal(mock.calls.length, 1);
  const call = mock.calls[0];
  assert.equal(call.url, 'https://brno.api.tiducto.eu/routing/plan');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.get('apikey'), 'k');
  assert.equal(call.headers.get('x-spider-contract-version'), CONTRACT_VERSION);
  assert.equal(call.headers.get('x-spider-sdk'), SDK_IDENTITY);

  const body = JSON.parse(call.body);
  assert.equal(body.id, PLAN.id);
  assert.equal(body.variables.first, undefined);
  assert.equal(body.variables.last, undefined);
  assert.deepEqual(body.variables.origin, { location: { coordinate: { latitude: 49.19, longitude: 16.61 } } });
  assert.ok(typeof body.variables.dateTime.earliestDeparture === 'string');

  if (!result.isSuccess) throw new Error(`expected success, got ${result.error.code}`);
  const route = result.data;
  assert.equal(route.edges.length, 1);
  const it = route.edges[0].itinerary;
  assert.equal(it.durationSeconds, 1800);
  assert.equal(it.numberOfTransfers, 1);
  const leg = it.legs[0];
  assert.equal(leg.mode, 'TRAM');
  assert.equal(leg.fromName, 'A');
  assert.equal(leg.routeShortName, '1');
  assert.equal(leg.distanceMeters, 1200.5);
  assert.equal(leg.durationSeconds, 900);
  assert.equal(leg.tripGtfsId, '1:trip');
  assert.equal(leg.bikesAllowed, 'ALLOWED');
  assert.equal(leg.fromWheelchair, 'POSSIBLE');
  assert.equal(leg.toWheelchair, 'NOT_POSSIBLE');
  assert.equal(leg.fromGtfsId, '1:A');
  assert.equal(leg.toGtfsId, '1:B');
  assert.equal(leg.fromPlatformCode, '2');
  assert.equal(leg.toPlatformCode, 'B');
  assert.equal(leg.fromZoneId, '100');
  assert.equal(leg.toZoneId, '101');
  assert.equal(leg.routeGtfsId, '1:L1');
  assert.equal(leg.routeColor, 'FF0000');
  assert.equal(leg.routeTextColor, 'FFFFFF');
  assert.ok(leg.geometry.length > 0);
  // Realtime delays ride the shared wire→domain mapper, so the one-shot plan surfaces them too.
  assert.equal(leg.isRealtime, true);
  assert.equal(leg.realtimeState, 'UPDATED');
  assert.equal(leg.startDelaySeconds, 120);
  assert.equal(leg.endDelaySeconds, 60);
  assert.equal(leg.startEstimated, '2026-07-20T08:02:00Z');
  assert.equal(leg.serviceDate, '2026-07-20');
  assert.equal(route.pageInfo.hasNextPage, true);
});

test('plan with arriveBy sets latestArrival', async () => {
  const mock = mockFetch({ json: PLAN_ENVELOPE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.routing.plan({
    origin: Location.stop('U1'),
    destination: Location.coordinate(49.23, 16.53),
    arriveBy: new Date('2026-07-20T09:00:00Z'),
  });
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.variables.dateTime.latestArrival, '2026-07-20T09:00:00.000Z');
  assert.deepEqual(body.variables.origin, { location: { stopLocation: { stopLocationId: 'U1' } } });
});

// Europe/Prague service-day anchors (noon minus 12h, local): 2026-07-20 (CEST) and the 2026-10-25 DST change.
const SERVICE_DAY_2026_07_20 = 1_784_498_400;
const SERVICE_DAY_2026_10_25 = 1_792_882_800;

test('departures maps stoptimes, keeps rows headed for the stop itself, and carries the service date', async () => {
  const mock = mockFetch({
    json: {
      data: {
        asStop: {
          gtfsId: 'U1',
          name: 'Main',
          stoptimesWithoutPatterns: [
            {
              serviceDay: 1000,
              scheduledDeparture: 60,
              realtimeDeparture: 90,
              realtime: true,
              realtimeState: 'UPDATED',
              headsign: 'Center',
              stop: { gtfsId: 'U1Z2', platformCode: '2' },
              trip: {
                gtfsId: 't1',
                wheelchairAccessible: 'POSSIBLE',
                route: { gtfsId: '1:L5', shortName: '5', longName: 'Line 5', mode: 'BUS', color: '00A0E0', textColor: '000000' },
              },
            },
            {
              serviceDay: 1000,
              scheduledDeparture: 120,
              headsign: 'Main',
              trip: { gtfsId: 't2', route: { shortName: '6', mode: 'TRAM' } },
            },
          ],
        },
        asStation: null,
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.departures('U1', 5);

  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.id, DEPARTURES.id);
  assert.equal(body.variables.numberOfDepartures, 5);
  assert.equal(body.variables.timeRange, 86_400);

  if (!result.isSuccess) throw new Error(result.error.code);
  // A headsign equal to the stop name is a real departure (e.g. a loop line), not a terminus row.
  assert.deepEqual(result.data.map((d) => d.tripGtfsId), ['t1', 't2']);
  const d = result.data[0];
  assert.equal(d.scheduledTimeEpochMs, 1_060_000);
  assert.equal(d.realtimeTimeEpochMs, 1_090_000);
  assert.equal(d.routeShortName, '5');
  assert.equal(d.mode, 'BUS');
  assert.equal(d.serviceDate, '1970-01-01');
  assert.equal(d.routeGtfsId, '1:L5');
  assert.equal(d.routeColor, '00A0E0');
  assert.equal(d.routeTextColor, '000000');
  assert.equal(d.stopGtfsId, 'U1Z2');
  assert.equal(d.platformCode, '2');
  assert.equal(d.wheelchairAccessible, 'POSSIBLE');
  // Display fields the wire leaves out are null.
  const bare = result.data[1];
  assert.equal(bare.routeColor, null);
  assert.equal(bare.stopGtfsId, null);
  assert.equal(bare.platformCode, null);
  assert.equal(bare.wheelchairAccessible, null);
});

test('departure serviceDate is the trip\'s service day, across midnight and DST', async () => {
  const mock = mockFetch({
    json: {
      data: {
        asStop: null,
        asStation: {
          gtfsId: 'S1',
          name: 'Station',
          stoptimesWithoutPatterns: [
            // 00:40 on 21 July, still on the 20 July service day.
            { serviceDay: SERVICE_DAY_2026_07_20, scheduledDeparture: 24 * 3600 + 40 * 60, trip: { gtfsId: 'night' } },
            // 25 October is a 25-hour day; its anchor is 23:00Z the day before.
            { serviceDay: SERVICE_DAY_2026_10_25, scheduledDeparture: 8 * 3600, trip: { gtfsId: 'dst' } },
          ],
        },
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.departures('S1');

  if (!result.isSuccess) throw new Error(result.error.code);
  const [night, dst] = result.data;
  assert.equal(new Date(night.scheduledTimeEpochMs).toISOString(), '2026-07-20T22:40:00.000Z');
  assert.equal(night.serviceDate, '2026-07-20');
  assert.equal(dst.serviceDate, '2026-10-25');
});

test('trip maps stops, geometry and enums', async () => {
  const mock = mockFetch({
    json: {
      data: {
        trip: {
          gtfsId: 't1',
          route: { gtfsId: '1:L5', shortName: '5', longName: 'Line 5', mode: 'BUS', color: '00A0E0', textColor: '000000' },
          directionId: '0',
          tripHeadsign: 'Center',
          bikesAllowed: 'ALLOWED',
          wheelchairAccessible: 'NOT_POSSIBLE',
          stoptimesForDate: [
            {
              serviceDay: SERVICE_DAY_2026_07_20,
              scheduledArrival: 60,
              scheduledDeparture: 65,
              realtime: false,
              stop: { gtfsId: 's1', name: 'Stop 1', lat: 49.1, lon: 16.6, wheelchairBoarding: 'POSSIBLE', platformCode: 'A', zoneId: '100' },
            },
          ],
          tripGeometry: { points: '_p~iF~ps|U', length: 1 },
        },
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.trip('t1', '2026-07-20');

  assert.equal(JSON.parse(mock.calls[0].body).variables.serviceDate, '2026-07-20');
  if (!result.isSuccess) throw new Error(result.error.code);
  const trip = result.data;
  assert.equal(trip.gtfsId, 't1');
  assert.equal(trip.serviceDate, '2026-07-20');
  assert.equal(trip.mode, 'BUS');
  assert.equal(trip.bikesAllowed, 'ALLOWED');
  assert.equal(trip.wheelchairAccessible, 'NOT_POSSIBLE');
  assert.equal(trip.routeGtfsId, '1:L5');
  assert.equal(trip.routeColor, '00A0E0');
  assert.equal(trip.routeTextColor, '000000');
  assert.equal(trip.stops[0].platformCode, 'A');
  assert.equal(trip.stops[0].zoneId, '100');
  assert.equal(trip.stops.length, 1);
  assert.equal(trip.stops[0].name, 'Stop 1');
  assert.equal(trip.stops[0].scheduledArrivalEpochMs, (SERVICE_DAY_2026_07_20 + 60) * 1000);
  assert.equal(trip.stops[0].wheelchairBoarding, 'POSSIBLE');
  assert.equal(trip.geometry.length, 1);
});

test('trip rejects a malformed service date as bad_request without a request', async () => {
  const mock = mockFetch({ json: {} });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  for (const serviceDate of ['20260720', '2026-02-30', '2026-7-20', '']) {
    const result = await client.routing.trip('t1', serviceDate);
    assert.equal(result.isSuccess, false, serviceDate);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, 'serviceDate');
    }
  }
  assert.equal(mock.calls.length, 0);
});

test('trip on a date it does not run has no service date', async () => {
  const mock = mockFetch({ json: { data: { trip: { gtfsId: 't1', route: { mode: 'BUS' }, stoptimesForDate: [] } } } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.trip('t1', '2026-07-20');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.serviceDate, null);
  assert.equal(result.data.stops.length, 0);
  assert.equal(result.data.routeGtfsId, null);
  assert.equal(result.data.routeColor, null);
  assert.equal(result.data.wheelchairAccessible, null);
});

test('an HTTP error becomes a failure result', async () => {
  const mock = mockFetch({ status: 500, text: 'boom' });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.plan({
    origin: Location.coordinate(1, 2),
    destination: Location.coordinate(3, 4),
  });
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'server');
    assert.equal(result.error.httpStatus, 500);
  }
});

test('upstream GraphQL errors become a failure result', async () => {
  const mock = mockFetch({ json: { errors: [{ message: 'bad input' }] } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.plan({
    origin: Location.coordinate(1, 2),
    destination: Location.coordinate(3, 4),
  });
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) assert.equal(result.error.code, 'server');
});

test('a top-level BAD_REQUEST error becomes a bad_request failure with field + message', async () => {
  const mock = mockFetch({
    json: {
      data: null,
      errors: [
        { message: 'searchWindow is out of range', extensions: { code: 'BAD_REQUEST', field: 'searchWindow' } },
      ],
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.plan({
    origin: Location.coordinate(1, 2),
    destination: Location.coordinate(3, 4),
  });
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'searchWindow');
    assert.equal(result.error.message, 'searchWindow is out of range');
  }
});

test('a gateway declaring another contract major is not an error', async () => {
  const otherMajor = `${Number(CONTRACT_VERSION.split('.')[0]) + 1}.0.0`;
  const mock = mockFetch({ json: PLAN_ENVELOPE, headers: { 'x-spider-contract-version': otherMajor } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.plan({ origin: Location.coordinate(1, 2), destination: Location.coordinate(3, 4) });
  assert.equal(result.isSuccess, true);
});

test('a retired persisted query is a query_retired failure that states the state', async () => {
  const mock = mockFetch({ status: 410, json: { error: 'query_retired', message: 'persisted query is retired' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.plan({ origin: Location.coordinate(1, 2), destination: Location.coordinate(3, 4) });
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'query_retired');
    assert.equal(result.error.httpStatus, 410);
    assert.equal(result.error.serverCode, 'query_retired');
    assert.equal(result.error.message, 'persisted query is retired');
  }
});

test('an unknown persisted-query id stays an unauthorized failure with the gateway message', async () => {
  const mock = mockFetch({ status: 403, json: { error: 'persisted_query_rejected', message: 'unknown persisted-query id' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.plan({ origin: Location.coordinate(1, 2), destination: Location.coordinate(3, 4) });
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'unauthorized');
    assert.equal(result.error.serverCode, 'persisted_query_rejected');
    assert.equal(result.error.message, 'routing plan -> 403: unknown persisted-query id');
  }
});

test('routing errors decode FROM/TO/VIA, and unknown codes, fields and enums decode to UNKNOWN', async () => {
  const envelope = structuredClone(PLAN_ENVELOPE) as unknown as {
    data: { planConnection: { routingErrors: unknown[]; edges: { node: { legs: Record<string, unknown>[] } }[] } };
  };
  envelope.data.planConnection.routingErrors = [
    { code: 'LOCATION_NOT_FOUND', description: 'unknown via stop', inputField: 'VIA' },
    { code: 'LOCATION_NOT_FOUND', description: 'unknown origin', inputField: 'FROM' },
    { code: 'SOMETHING_NEW', description: 'x', inputField: 'FROM_PLACE' },
  ];
  const leg = envelope.data.planConnection.edges[0].node.legs[0];
  leg.mode = 'HOVERCRAFT';
  leg.realtimeState = 'DELAYED';
  leg.from = { name: 'A', stop: { gtfsId: '1:A', wheelchairBoarding: 'PARTIAL' } };
  leg.trip = { gtfsId: '1:trip', bikesAllowed: 'FOLDING_ONLY' };
  const mock = mockFetch({ json: envelope });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B') });

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.deepEqual(result.data.routingErrors, [
    { code: 'LOCATION_NOT_FOUND', description: 'unknown via stop', inputField: 'VIA' },
    { code: 'LOCATION_NOT_FOUND', description: 'unknown origin', inputField: 'FROM' },
    { code: 'UNKNOWN', description: 'x', inputField: 'UNKNOWN' },
  ]);
  const mapped = result.data.edges[0].itinerary.legs[0];
  assert.equal(mapped.mode, 'UNKNOWN');
  assert.equal(mapped.realtimeState, 'UNKNOWN');
  assert.equal(mapped.fromWheelchair, 'UNKNOWN');
  assert.equal(mapped.bikesAllowed, 'UNKNOWN');
});

test('departures and trip decode unknown realtime states and modes to UNKNOWN', async () => {
  const mock = mockFetch({
    json: {
      data: {
        asStop: {
          gtfsId: 'U1',
          name: 'Main',
          stoptimesWithoutPatterns: [
            { serviceDay: 1000, scheduledDeparture: 60, realtimeState: 'DELAYED', trip: { gtfsId: 't1', route: { gtfsId: 'r1', mode: 'HOVERCRAFT' } } },
          ],
        },
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.departures('U1');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data[0].realtimeState, 'UNKNOWN');
  assert.equal(result.data[0].mode, 'UNKNOWN');
});

test('departures sends 30 departures over 24 h by default', async () => {
  const mock = mockFetch({ json: { data: { asStop: { gtfsId: 'U1', name: 'Main', stoptimesWithoutPatterns: [] } } } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.departures('U1');

  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.variables.numberOfDepartures, 30);
  assert.equal(body.variables.timeRange, 86_400);
});

test('departures rejects a timeRange outside (0, 24 h] as bad_request without a request', async () => {
  const mock = mockFetch({ json: { data: { asStop: { gtfsId: 'U1', name: 'Main', stoptimesWithoutPatterns: [] } } } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  for (const timeRangeSeconds of [0, -60, 86_401, Number.NaN]) {
    const result = await client.routing.departures('U1', 30, { timeRangeSeconds });
    assert.equal(result.isSuccess, false, String(timeRangeSeconds));
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, 'timeRange');
      assert.equal(result.error.message, 'timeRange is out of range');
    }
  }
  assert.equal(mock.calls.length, 0);

  await client.routing.departures('U1', 30, { timeRangeSeconds: 86_400 });
  assert.equal(JSON.parse(mock.calls[0].body).variables.timeRange, 86_400);
});

test('plan rejects a via with 0 or more than 10 stop ids, or a wait outside 0–24 h, without a request', async () => {
  const mock = mockFetch({ json: PLAN_ENVELOPE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `1:S${i}`);
  const plan = (via: ViaLocation[]) =>
    client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B'), via });

  for (const via of [
    [ViaLocation.passThrough()],
    [ViaLocation.passThrough(...ids(11))],
    [ViaLocation.visit(Location.stop('1:V'), -1)],
    [ViaLocation.visit(Location.stop('1:V'), 86_401)],
    [ViaLocation.passThrough('1:V'), ViaLocation.passThrough()],
  ]) {
    const result = await plan(via);
    assert.equal(result.isSuccess, false);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, 'via');
      assert.equal(result.error.message, 'via is out of range');
    }
  }
  assert.equal(mock.calls.length, 0);

  const ok = await plan([ViaLocation.passThrough(...ids(10)), ViaLocation.visit(Location.stop('1:V'), 86_400)]);
  assert.equal(ok.isSuccess, true);
  assert.deepEqual(JSON.parse(mock.calls[0].body).variables.via[1], { visit: { stopLocationIds: ['1:V'], minimumWaitTime: 'PT86400S' } });
});

test('plan sends the search window as given, without widening it', async () => {
  const mock = mockFetch({ json: PLAN_ENVELOPE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B'), searchWindowMinutes: 0 });
  assert.equal(JSON.parse(mock.calls[0].body).variables.searchWindow, 'PT0M');
});

test('plan maps modes, transfers, wheelchair, and search window to OTP inputs', async () => {
  const mock = mockFetch({ json: PLAN_ENVELOPE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.plan({
    origin: Location.coordinate(49.19, 16.61),
    destination: Location.coordinate(49.23, 16.53),
    // WALK is a street mode, not a transit filter — it must drop out, leaving BUS + TRAM.
    allowedTransitModes: ['BUS', 'TRAM', 'WALK'],
    // 2 transfers ⇒ wire maximumTransfers = 3 (the router counts boardings = transfers + 1).
    maxTransfers: 2,
    wheelchairAccessible: true,
    searchWindowMinutes: 30,
  });

  const body = JSON.parse(mock.calls[0].body);
  assert.deepEqual(body.variables.modes, { transit: { transit: [{ mode: 'BUS' }, { mode: 'TRAM' }] } });
  assert.deepEqual(body.variables.preferences, {
    transit: { transfer: { maximumTransfers: 3 } },
    accessibility: { wheelchair: { enabled: true } },
  });
  assert.equal(body.variables.searchWindow, 'PT30M');
});

test('plan omits modes/preferences with no filters and defaults the 1h search window', async () => {
  const mock = mockFetch({ json: PLAN_ENVELOPE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.plan({ origin: Location.stop('1:U1'), destination: Location.stop('1:U2') });

  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.variables.modes, undefined);
  assert.equal(body.variables.preferences, undefined);
  assert.equal(body.variables.searchWindow, 'PT60M');
});

test('planPrevious pages backward with before and no count', async () => {
  const envelope = structuredClone(PLAN_ENVELOPE);
  envelope.data.planConnection.pageInfo.hasPreviousPage = true;
  const mock = mockFetch({ json: envelope });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const first = await client.routing.plan({ origin: Location.stop('1:U1'), destination: Location.stop('1:U2') });
  if (!first.isSuccess) throw new Error('expected success');
  await client.routing.planPrevious(first.data);

  const body = JSON.parse(mock.calls[1].body);
  assert.equal(body.variables.before, 'c1');
  assert.equal(body.variables.first, undefined);
  assert.equal(body.variables.last, undefined);
  assert.equal(body.variables.after, undefined);
});
