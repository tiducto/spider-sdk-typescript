import test from 'node:test';
import assert from 'node:assert/strict';
import { Location, SpiderClient, ViaLocation } from '../src/index.ts';
import { CONTRACT_VERSION } from '../src/contract.ts';
import { SDK_IDENTITY } from '../src/sdk.ts';
import { mockFetch } from './support.ts';
import type { Captured } from './support.ts';

const PLAN_RESPONSE = {
  itineraries: [
    {
      start: '2026-07-20T08:00:00Z',
      end: '2026-07-20T08:30:00Z',
      duration: 1800,
      waitingTime: 120,
      numberOfTransfers: 1,
      legs: [
        {
          mode: 'TRAM',
          start: { scheduledTime: '2026-07-20T08:00:00Z', estimated: { time: '2026-07-20T08:02:00Z', delay: 'PT120S' } },
          end: { scheduledTime: '2026-07-20T08:15:00Z', estimated: { time: '2026-07-20T08:16:00Z', delay: 'PT60S' } },
          typicalArrivalDelay: 90,
          realtimeState: 'UPDATED',
          realTime: true,
          serviceDate: '2026-07-20',
          from: { name: 'A', stop: { gtfsId: '1:A', wheelchairBoarding: 'POSSIBLE', platformCode: '2', zoneId: '100' } },
          to: { name: 'B', stop: { gtfsId: '1:B', wheelchairBoarding: 'NOT_POSSIBLE', platformCode: 'B', zoneId: '101' } },
          route: { gtfsId: '1:L1', shortName: '1', longName: 'Line 1', color: 'FF0000', textColor: 'FFFFFF' },
          headsign: 'Center',
          distance: 1200.5,
          duration: 900,
          trip: { gtfsId: '1:trip', bikesAllowed: 'ALLOWED' },
          interlineWithPreviousLeg: true,
          legGeometry: { points: '_p~iF~ps|U' },
        },
      ],
    },
  ],
  pageInfo: { startCursor: 'c-start', endCursor: 'c-end', hasNextPage: true, hasPreviousPage: true, searchWindowUsed: 'PT1H' },
  routingErrors: [],
  searchDateTime: '2026-07-20T08:00:00Z',
};

function bodyOf(call: Captured): Record<string, unknown> {
  return JSON.parse(call.body) as Record<string, unknown>;
}

test('plan POSTs the REST body to /routing/plan and maps the route', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
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
  assert.equal(call.headers.get('content-type'), 'application/json');
  assert.equal(call.headers.get('x-spider-contract-version'), CONTRACT_VERSION);
  assert.equal(call.headers.get('x-spider-sdk'), SDK_IDENTITY);

  // No reliability, page size or cursor requested: the members are left out, not defaulted.
  const body = bodyOf(call);
  assert.deepEqual(Object.keys(body), ['dateTime', 'origin', 'destination', 'searchWindow']);
  assert.deepEqual(body.origin, { location: { coordinate: { latitude: 49.19, longitude: 16.61 } } });
  assert.equal(typeof (body.dateTime as { earliestDeparture?: unknown }).earliestDeparture, 'string');

  if (!result.isSuccess) throw new Error(`expected success, got ${result.error.code}`);
  const route = result.data;
  assert.equal(route.edges.length, 1);
  assert.equal(route.edges[0].cursor, 'NoCursor');
  const it = route.edges[0].itinerary;
  assert.equal(it.durationSeconds, 1800);
  assert.equal(it.waitingTimeSeconds, 120);
  assert.equal(it.numberOfTransfers, 1);
  assert.equal(it.accessibilityScore, null);
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
  assert.equal(leg.accessibilityScore, null);
  assert.ok(leg.geometry.length > 0);
  // Realtime delays ride the shared wire→domain mapper, so the one-shot plan surfaces them too.
  assert.equal(leg.isRealtime, true);
  assert.equal(leg.realtimeState, 'UPDATED');
  assert.equal(leg.startDelaySeconds, 120);
  assert.equal(leg.endDelaySeconds, 60);
  assert.equal(leg.startEstimated, '2026-07-20T08:02:00Z');
  assert.equal(leg.serviceDate, '2026-07-20');
  assert.equal(leg.typicalArrivalDelaySeconds, 90);
  assert.equal(leg.interlineWithPreviousLeg, true);
  assert.deepEqual(route.pageInfo, {
    startCursor: 'c-start',
    endCursor: 'c-end',
    hasNextPage: true,
    hasPreviousPage: true,
    searchWindowUsed: 'PT1H',
  });
  assert.deepEqual(route.routingErrors, []);
  assert.equal(route.searchDateTime, '2026-07-20T08:00:00Z');
});

test('plan sends every option as the exact PlanTripRequest body', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.plan({
    origin: Location.stop('1:A'),
    destination: Location.coordinate(49.23, 16.53),
    departAt: new Date('2026-07-20T08:00:00Z'),
    via: [ViaLocation.passThrough('1:P'), ViaLocation.visit(Location.stop('1:V'), 300)],
    allowedTransitModes: ['TRAM', 'BUS'],
    maxTransfers: 1,
    searchWindowMinutes: 90,
    wheelchairAccessible: true,
    reliability: 'SAFE',
  });

  assert.equal(
    mock.calls[0].body,
    '{"dateTime":{"earliestDeparture":"2026-07-20T08:00:00.000Z"},'
      + '"origin":{"location":{"stopLocation":{"stopLocationId":"1:A"}}},'
      + '"destination":{"location":{"coordinate":{"latitude":49.23,"longitude":16.53}}},'
      + '"via":[{"passThrough":{"stopLocationIds":["1:P"]}},{"visit":{"stopLocationIds":["1:V"],"minimumWaitTime":"PT300S"}}],'
      + '"modes":{"transit":{"transit":[{"mode":"TRAM"},{"mode":"BUS"}]}},'
      + '"preferences":{"transit":{"transfer":{"maximumTransfers":2}},"accessibility":{"wheelchair":{"enabled":true}}},'
      + '"searchWindow":"PT90M","reliability":"SAFE"}',
  );
});

test('plan sends reliability when set and keeps it when paging', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const first = await client.routing.plan({
    origin: Location.stop('1:A'),
    destination: Location.stop('1:B'),
    reliability: 'VERY_SAFE',
  });
  if (!first.isSuccess) throw new Error(first.error.code);
  await client.routing.planNext(first.data);

  assert.equal(bodyOf(mock.calls[0]).reliability, 'VERY_SAFE');
  assert.equal(bodyOf(mock.calls[1]).reliability, 'VERY_SAFE');
});

test('a leg without a typical arrival delay or interline flag maps to null and false', async () => {
  const response = structuredClone(PLAN_RESPONSE) as unknown as { itineraries: { legs: Record<string, unknown>[] }[] };
  const legs = response.itineraries[0].legs;
  const absent = { ...legs[0] };
  delete absent.typicalArrivalDelay;
  delete absent.interlineWithPreviousLeg;
  legs.splice(0, 1, { ...legs[0], typicalArrivalDelay: null, interlineWithPreviousLeg: null }, absent);
  const mock = mockFetch({ json: response });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B') });

  if (!result.isSuccess) throw new Error(result.error.code);
  for (const leg of result.data.edges[0].itinerary.legs) {
    assert.equal(leg.typicalArrivalDelaySeconds, null);
    assert.equal(leg.interlineWithPreviousLeg, false);
  }
});

test('plan with arriveBy sets latestArrival', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.routing.plan({
    origin: Location.stop('U1'),
    destination: Location.coordinate(49.23, 16.53),
    arriveBy: new Date('2026-07-20T09:00:00Z'),
  });
  const body = bodyOf(mock.calls[0]);
  assert.deepEqual(body.dateTime, { latestArrival: '2026-07-20T09:00:00.000Z' });
  assert.deepEqual(body.origin, { location: { stopLocation: { stopLocationId: 'U1' } } });
});

test('a declined plan is a route with no itineraries and the routing errors', async () => {
  const mock = mockFetch({
    json: {
      itineraries: [],
      pageInfo: { startCursor: null, endCursor: null, hasNextPage: false, hasPreviousPage: false, searchWindowUsed: null },
      routingErrors: [{ code: 'OUTSIDE_SERVICE_PERIOD', description: 'date is outside the feed', inputField: 'DATE_TIME' }],
      searchDateTime: '2026-07-20T08:00:00Z',
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B') });

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.deepEqual(result.data.edges, []);
  assert.deepEqual(result.data.routingErrors, [
    { code: 'OUTSIDE_SERVICE_PERIOD', description: 'date is outside the feed', inputField: 'DATE_TIME' },
  ]);
  assert.deepEqual(result.data.pageInfo, {
    startCursor: null,
    endCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    searchWindowUsed: null,
  });
  assert.equal(await client.routing.planNext(result.data), null);
  assert.equal(await client.routing.planPrevious(result.data), null);
});

// Europe/Prague service-day anchors (noon minus 12h, local): 2026-07-20 (CEST) and the 2026-10-25 DST change.
const SERVICE_DAY_2026_07_20 = 1_784_498_400;
const SERVICE_DAY_2026_10_25 = 1_792_882_800;

test('departures POSTs to /routing/departures, maps stoptimes, keeps rows headed for the stop itself, and carries the service date', async () => {
  const mock = mockFetch({
    json: {
      stop: {
        gtfsId: 'U1',
        name: 'Main',
        wheelchairBoarding: 'POSSIBLE',
        stoptimesWithoutPatterns: [
          {
            serviceDay: 1000,
            scheduledDeparture: 60,
            realtimeDeparture: 90,
            realtime: true,
            realtimeState: 'UPDATED',
            typicalDelay: 45,
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
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.departures('U1', 5, { startTime: 1_784_534_400_000 });

  assert.equal(mock.calls[0].url, 'https://x/routing/departures');
  assert.equal(mock.calls[0].method, 'POST');
  assert.equal(mock.calls[0].body, '{"id":"U1","numberOfDepartures":5,"startTime":1784534400,"timeRange":86400}');

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
  assert.equal(d.typicalDelaySeconds, 45);
  // Display fields the wire leaves out are null.
  const bare = result.data[1];
  assert.equal(bare.routeColor, null);
  assert.equal(bare.stopGtfsId, null);
  assert.equal(bare.platformCode, null);
  assert.equal(bare.wheelchairAccessible, null);
  assert.equal(bare.typicalDelaySeconds, null);
});

test('departure serviceDate is the trip\'s service day, across midnight and DST', async () => {
  const mock = mockFetch({
    json: {
      stop: {
        gtfsId: 'S1',
        name: 'Station',
        wheelchairBoarding: null,
        stoptimesWithoutPatterns: [
          // 00:40 on 21 July, still on the 20 July service day.
          { serviceDay: SERVICE_DAY_2026_07_20, scheduledDeparture: 24 * 3600 + 40 * 60, typicalDelay: 20, trip: { gtfsId: 'night' } },
          // 25 October is a 25-hour day; its anchor is 23:00Z the day before.
          { serviceDay: SERVICE_DAY_2026_10_25, scheduledDeparture: 8 * 3600, trip: { gtfsId: 'dst' } },
        ],
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.departures('S1');

  if (!result.isSuccess) throw new Error(result.error.code);
  const [night, dst] = result.data;
  assert.equal(new Date(night.scheduledTimeEpochMs).toISOString(), '2026-07-20T22:40:00.000Z');
  assert.equal(night.serviceDate, '2026-07-20');
  assert.equal(night.typicalDelaySeconds, 20);
  assert.equal(dst.serviceDate, '2026-10-25');
  assert.equal(dst.typicalDelaySeconds, null);
});

test('trip POSTs to /routing/trip and maps stops, geometry and enums', async () => {
  const mock = mockFetch({
    json: {
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
            typicalDelay: 30,
            stop: { gtfsId: 's1', name: 'Stop 1', lat: 49.1, lon: 16.6, wheelchairBoarding: 'POSSIBLE', platformCode: 'A', zoneId: '100' },
          },
          {
            serviceDay: SERVICE_DAY_2026_07_20,
            scheduledArrival: 120,
            typicalDelay: null,
            stop: { gtfsId: 's2', name: 'Stop 2' },
          },
        ],
        tripGeometry: { points: '_p~iF~ps|U', length: 1 },
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.trip('t1', '2026-07-20');

  assert.equal(mock.calls[0].url, 'https://x/routing/trip');
  assert.equal(mock.calls[0].method, 'POST');
  assert.equal(mock.calls[0].body, '{"id":"t1","serviceDate":"2026-07-20"}');
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
  assert.equal(trip.stops.length, 2);
  assert.equal(trip.stops[0].name, 'Stop 1');
  assert.equal(trip.stops[0].typicalDelaySeconds, 30);
  assert.equal(trip.stops[1].typicalDelaySeconds, null);
  assert.equal(trip.stops[0].scheduledArrivalEpochMs, (SERVICE_DAY_2026_07_20 + 60) * 1000);
  assert.equal(trip.stops[0].wheelchairBoarding, 'POSSIBLE');
  assert.equal(trip.geometry.length, 1);
});

test('trip without a service date leaves it out of the body', async () => {
  const mock = mockFetch({ json: { trip: { gtfsId: 't1', route: { mode: 'BUS' }, stoptimesForDate: [] } } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.trip('t1');

  assert.equal(mock.calls[0].body, '{"id":"t1"}');
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
  const mock = mockFetch({ json: { trip: { gtfsId: 't1', route: { mode: 'BUS' }, stoptimesForDate: [] } } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.trip('t1', '2026-07-20');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.serviceDate, null);
  assert.equal(result.data.stops.length, 0);
  assert.equal(result.data.routeGtfsId, null);
  assert.equal(result.data.routeColor, null);
  assert.equal(result.data.wheelchairAccessible, null);
});

test('an unknown stop or trip id (a 200 with null) is not_found', async () => {
  const mock = mockFetch((req) => ({ json: req.url.endsWith('/routing/departures') ? { stop: null } : { trip: null } }));
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const departures = await client.routing.departures('1:nope');
  assert.equal(departures.isSuccess, false);
  if (!departures.isSuccess) assert.equal(departures.error.code, 'not_found');

  const trip = await client.routing.trip('1:nope');
  assert.equal(trip.isSuccess, false);
  if (!trip.isSuccess) assert.equal(trip.error.code, 'not_found');
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

test('a 400 is bad_request naming the body field as a dot path', async () => {
  const field = 'preferences.transit.transfer.maximumTransfers';
  const mock = mockFetch({ status: 400, json: { code: 'bad_request', message: `${field} is out of range`, field } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({ origin: Location.coordinate(1, 2), destination: Location.coordinate(3, 4), maxTransfers: 99 });

  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.httpStatus, 400);
    assert.equal(result.error.serverCode, 'bad_request');
    assert.equal(result.error.field, field);
    assert.equal(result.error.message, `POST /routing/plan -> 400: ${field} is out of range`);
  }
});

test('a 400 without a body field takes the field its message names', async () => {
  const mock = mockFetch({ status: 400, json: { code: 'bad_request', message: 'numberOfDepartures is out of range' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.departures('U1', 500);

  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'numberOfDepartures');
    assert.equal(result.error.message, 'POST /routing/departures -> 400: numberOfDepartures is out of range');
  }
});

test('a gateway declaring another contract major is not an error', async () => {
  const otherMajor = `${Number(CONTRACT_VERSION.split('.')[0]) + 1}.0.0`;
  const mock = mockFetch({ json: PLAN_RESPONSE, headers: { 'x-spider-contract-version': otherMajor } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.plan({ origin: Location.coordinate(1, 2), destination: Location.coordinate(3, 4) });
  assert.equal(result.isSuccess, true);
});

test('a 410 on any routing call is query_retired with the server message', async () => {
  const mock = mockFetch({ status: 410, json: { code: 'query_retired', message: 'persisted queries are retired' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  for (const result of [
    await client.routing.plan({ origin: Location.coordinate(1, 2), destination: Location.coordinate(3, 4) }),
    await client.routing.departures('U1'),
    await client.routing.trip('t1'),
  ]) {
    assert.equal(result.isSuccess, false);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'query_retired');
      assert.equal(result.error.httpStatus, 410);
      assert.equal(result.error.serverCode, 'query_retired');
      assert.equal(result.error.message, 'persisted queries are retired');
    }
  }
});

test('routing errors decode FROM/TO/VIA, and unknown codes, fields and enums decode to UNKNOWN', async () => {
  const response = structuredClone(PLAN_RESPONSE) as unknown as {
    routingErrors: unknown[];
    itineraries: { legs: Record<string, unknown>[] }[];
  };
  response.routingErrors = [
    { code: 'LOCATION_NOT_FOUND', description: 'unknown via stop', inputField: 'VIA' },
    { code: 'LOCATION_NOT_FOUND', description: 'unknown origin', inputField: 'FROM' },
    { code: 'SOMETHING_NEW', description: 'x', inputField: 'FROM_PLACE' },
  ];
  const leg = response.itineraries[0].legs[0];
  leg.mode = 'HOVERCRAFT';
  leg.realtimeState = 'DELAYED';
  leg.from = { name: 'A', stop: { gtfsId: '1:A', wheelchairBoarding: 'PARTIAL' } };
  leg.trip = { gtfsId: '1:trip', bikesAllowed: 'FOLDING_ONLY' };
  const mock = mockFetch({ json: response });
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
      stop: {
        gtfsId: 'U1',
        name: 'Main',
        stoptimesWithoutPatterns: [
          { serviceDay: 1000, scheduledDeparture: 60, realtimeState: 'DELAYED', trip: { gtfsId: 't1', route: { gtfsId: 'r1', mode: 'HOVERCRAFT' } } },
        ],
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.departures('U1');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data[0].realtimeState, 'UNKNOWN');
  assert.equal(result.data[0].mode, 'UNKNOWN');
});

test('departures sends 30 departures over 24 h from now by default', async () => {
  const mock = mockFetch({ json: { stop: { gtfsId: 'U1', name: 'Main', stoptimesWithoutPatterns: [] } } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.departures('U1');

  assert.equal(mock.calls[0].body, '{"id":"U1","numberOfDepartures":30,"timeRange":86400}');
});

test('departures rejects a timeRange outside (0, 24 h] as bad_request without a request', async () => {
  const mock = mockFetch({ json: { stop: { gtfsId: 'U1', name: 'Main', stoptimesWithoutPatterns: [] } } });
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
  assert.equal(bodyOf(mock.calls[0]).timeRange, 86_400);
});

test('plan rejects a via with 0 or more than 10 stop ids, or a wait outside 0–1 h, without a request', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `1:S${i}`);
  const plan = (via: ViaLocation[]) =>
    client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B'), via });

  for (const [via, field] of [
    [[ViaLocation.passThrough()], 'via'],
    [[ViaLocation.passThrough(...ids(11))], 'via'],
    [[ViaLocation.passThrough('1:V'), ViaLocation.passThrough()], 'via'],
    [[ViaLocation.visit(Location.stop('1:V'), -1)], 'via.visit.minimumWaitTime'],
    [[ViaLocation.visit(Location.stop('1:V'), 3601)], 'via.visit.minimumWaitTime'],
  ] as const) {
    const result = await plan([...via]);
    assert.equal(result.isSuccess, false);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, field);
      assert.equal(result.error.message, `${field} is out of range`);
    }
  }
  assert.equal(mock.calls.length, 0);

  const ok = await plan([ViaLocation.passThrough(...ids(10)), ViaLocation.visit(Location.stop('1:V'), 3600)]);
  assert.equal(ok.isSuccess, true);
  assert.deepEqual((bodyOf(mock.calls[0]).via as unknown[])[1], { visit: { stopLocationIds: ['1:V'], minimumWaitTime: 'PT3600S' } });
});

test('plan rejects a visit to a coordinate as via is invalid without a request', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({
    origin: Location.stop('1:A'),
    destination: Location.stop('1:B'),
    via: [ViaLocation.passThrough('1:P'), ViaLocation.visit(Location.coordinate(49.2, 16.6), 60)],
  });

  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'via');
    assert.equal(result.error.message, 'via is invalid');
  }
  assert.equal(mock.calls.length, 0);
});

test('plan sends the search window as given, without widening it', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B'), searchWindowMinutes: 0 });
  assert.equal(bodyOf(mock.calls[0]).searchWindow, 'PT0M');
});

test('plan maps modes, transfers, wheelchair, and search window to OTP inputs', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
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

  const body = bodyOf(mock.calls[0]);
  assert.deepEqual(body.modes, { transit: { transit: [{ mode: 'BUS' }, { mode: 'TRAM' }] } });
  assert.deepEqual(body.preferences, {
    transit: { transfer: { maximumTransfers: 3 } },
    accessibility: { wheelchair: { enabled: true } },
  });
  assert.equal(body.searchWindow, 'PT30M');
});

test('plan omits modes/preferences with no filters and defaults the 1h search window', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.plan({ origin: Location.stop('1:U1'), destination: Location.stop('1:U2') });

  const body = bodyOf(mock.calls[0]);
  assert.equal('modes' in body, false);
  assert.equal('preferences' in body, false);
  assert.equal(body.searchWindow, 'PT60M');
});

// Paging pairs one cursor with the original body: next = body + after, previous = body + before. A page reached
// by paging never carries its own cursor into the next request.
test('planNext pages forward with after and planPrevious backward with before, each alone', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const first = await client.routing.plan({ origin: Location.stop('1:U1'), destination: Location.stop('1:U2'), reliability: 'SAFE' });
  if (!first.isSuccess) throw new Error('expected success');
  const next = await client.routing.planNext(first.data);
  if (next == null || !next.isSuccess) throw new Error('expected a next page');
  await client.routing.planPrevious(next.data);

  const [initial, forward, backward] = mock.calls.map(bodyOf);
  assert.equal(initial.reliability, 'SAFE');
  for (const body of [initial, forward, backward]) {
    assert.equal('first' in body, false);
    assert.equal('last' in body, false);
  }
  assert.deepEqual(Object.keys(backward), [...Object.keys(initial), 'before']);
  assert.deepEqual(forward, { ...initial, after: 'c-end' });
  assert.deepEqual(backward, { ...initial, before: 'c-start' });
});

test('planNext and planPrevious are null when the page has no neighbour that way', async () => {
  const response = structuredClone(PLAN_RESPONSE);
  response.pageInfo.hasNextPage = false;
  response.pageInfo.hasPreviousPage = false;
  const mock = mockFetch({ json: response });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const first = await client.routing.plan({ origin: Location.stop('1:U1'), destination: Location.stop('1:U2') });
  if (!first.isSuccess) throw new Error('expected success');

  assert.equal(await client.routing.planNext(first.data), null);
  assert.equal(await client.routing.planPrevious(first.data), null);
  assert.equal(mock.calls.length, 1);
});
