import test from 'node:test';
import assert from 'node:assert/strict';
import { Location, SpiderClient, ViaLocation } from '../src/index.ts';
import { CONTRACT_VERSION } from '../src/contract.ts';
import { SDK_IDENTITY } from '../src/sdk.ts';
import { mockFetch } from './support.ts';
import type { Captured } from './support.ts';
import type { RoutePreferences } from '../src/index.ts';

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
          from: { name: 'A', stopPosition: 2, stop: { gtfsId: '1:A', wheelchairBoarding: 'POSSIBLE', platformCode: '2', zoneId: '100' } },
          to: { name: 'B', stopPosition: 5, stop: { gtfsId: '1:B', wheelchairBoarding: 'NOT_POSSIBLE', platformCode: 'B', zoneId: '101' } },
          route: { gtfsId: '1:L1', shortName: '1', longName: 'Line 1', color: 'FF0000', textColor: 'FFFFFF' },
          headsign: 'Center',
          distance: 1200.5,
          duration: 900,
          trip: { gtfsId: '1:trip', bikesAllowed: 'ALLOWED' },
          pickupType: 'SCHEDULED',
          dropoffType: 'COORDINATE_WITH_DRIVER',
          interlineWithPreviousLeg: true,
          legGeometry: { points: '_izlhA~rlgdF' },
        },
      ],
    },
  ],
  pageInfo: { startCursor: 'c-start', endCursor: 'c-end', hasNextPage: true, hasPreviousPage: true, searchWindowUsed: 'PT1H' },
  routingErrors: [],
  searchDateTime: '2026-07-20T08:00:00Z',
};

const OUT_OF_RANGE_PREFERENCES: readonly [RoutePreferences, string][] = [
  [{ walkSpeed: 0.09 }, 'preferences.street.walk.speed'],
  [{ walkSpeed: Number.POSITIVE_INFINITY }, 'preferences.street.walk.speed'],
  [{ walkSpeed: Number.NaN }, 'preferences.street.walk.speed'],
  [{ walkReluctance: 100_001 }, 'preferences.street.walk.reluctance'],
  [{ boardCost: -1 }, 'preferences.street.walk.boardCost'],
  [{ boardCost: 1.5 }, 'preferences.street.walk.boardCost'],
  [{ transferCost: 1_000_001 }, 'preferences.transit.transfer.cost'],
  [{ transferSlackSeconds: -1 }, 'preferences.transit.transfer.slack'],
  [{ waitReluctance: 0 }, 'preferences.transit.board.waitReluctance'],
  [{ boardSlackSeconds: 61 * 60 }, 'preferences.transit.board.slack'],
  [{ alightSlackSeconds: 3601 }, 'preferences.transit.alight.slack'],
];

function bodyOf(call: Captured): Record<string, unknown> {
  return JSON.parse(call.body) as Record<string, unknown>;
}

test('plan POSTs the REST body to /routing/v1/plan and maps the route', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({
    origin: Location.coordinate(49.19, 16.61),
    destination: Location.coordinate(49.23, 16.53),
  });

  assert.equal(mock.calls.length, 1);
  const call = mock.calls[0];
  assert.equal(call.url, 'https://brno.api.tiducto.eu/routing/v1/plan');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.get('apikey'), 'k');
  assert.equal(call.headers.get('content-type'), 'application/json');
  assert.equal(call.headers.get('x-spider-contract-version'), CONTRACT_VERSION);
  assert.equal(call.headers.get('x-spider-sdk'), SDK_IDENTITY);

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
  assert.equal(leg.fromStopPosition, 2);
  assert.equal(leg.toStopPosition, 5);
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
  assert.equal(leg.pickupType, 'SCHEDULED');
  assert.equal(leg.dropoffType, 'COORDINATE_WITH_DRIVER');
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

test('a walk leg maps its null route, trip, stops, estimates and typical delay to null', async () => {
  const response = structuredClone(PLAN_RESPONSE) as unknown as { itineraries: { legs: Record<string, unknown>[] }[] };
  response.itineraries[0].legs = [{
    mode: 'WALK',
    start: { scheduledTime: '2026-07-20T07:55:00Z', estimated: null },
    end: { scheduledTime: '2026-07-20T08:00:00Z', estimated: null },
    typicalArrivalDelay: null,
    realtimeState: 'SCHEDULED',
    realTime: false,
    serviceDate: null,
    from: { name: 'Origin', stop: null },
    to: { name: 'A', stop: { gtfsId: '1:A', wheelchairBoarding: 'NO_INFORMATION', platformCode: null, zoneId: null } },
    route: null,
    headsign: null,
    distance: 300,
    duration: 300,
    trip: null,
    pickupType: 'SCHEDULED',
    dropoffType: 'SCHEDULED',
    interlineWithPreviousLeg: false,
    legGeometry: { points: '_izlhA~rlgdF' },
  }];
  const mock = mockFetch({ json: response });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({ origin: Location.coordinate(49.19, 16.61), destination: Location.stop('1:A') });

  if (!result.isSuccess) throw new Error(result.error.code);
  const leg = result.data.edges[0].itinerary.legs[0];
  assert.equal(leg.mode, 'WALK');
  assert.equal(leg.typicalArrivalDelaySeconds, null);
  assert.equal(leg.interlineWithPreviousLeg, false);
  assert.equal(leg.pickupType, 'SCHEDULED');
  assert.equal(leg.dropoffType, 'SCHEDULED');
  assert.equal(leg.startEstimated, null);
  assert.equal(leg.startDelaySeconds, null);
  assert.equal(leg.serviceDate, null);
  assert.equal(leg.fromName, 'Origin');
  assert.equal(leg.fromGtfsId, null);
  assert.equal(leg.fromStopPosition, null);
  assert.equal(leg.toGtfsId, '1:A');
  assert.equal(leg.toPlatformCode, null);
  assert.equal(leg.toWheelchair, null);
  assert.equal(leg.routeGtfsId, null);
  assert.equal(leg.tripGtfsId, null);
  assert.equal(leg.bikesAllowed, null);
  assert.equal(leg.headsign, null);
  assert.equal(leg.durationSeconds, 300);
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

// Europe/Prague service-day anchor (noon minus 12h, local) of 2026-07-20 (CEST).
const SERVICE_DAY_2026_07_20 = 1_784_498_400;

const TRIP_WITHOUT_STOPS = {
  trip: {
    gtfsId: '1:t1',
    directionId: null,
    tripHeadsign: null,
    bikesAllowed: 'NO_INFORMATION',
    wheelchairAccessible: 'NO_INFORMATION',
    route: { gtfsId: '1:L5', shortName: '5', longName: null, mode: 'BUS', color: null, textColor: null },
    stoptimesForDate: [],
    tripGeometry: null,
  },
};

function departureRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    serviceDay: 1000,
    serviceDate: '2026-07-20',
    scheduledDeparture: 60,
    realtimeDeparture: 60,
    realtime: false,
    realtimeState: 'SCHEDULED',
    typicalDelay: null,
    pickupType: 'SCHEDULED',
    dropoffType: 'SCHEDULED',
    headsign: null,
    stop: { gtfsId: '1:U1Z1', platformCode: null },
    trip: {
      gtfsId: '1:t1',
      bikesAllowed: 'NO_INFORMATION',
      wheelchairAccessible: 'NO_INFORMATION',
      route: { gtfsId: '1:L5', shortName: null, longName: null, mode: 'BUS', color: null, textColor: null },
    },
    ...overrides,
  };
}

test('departures POSTs to /routing/v1/departures, maps stoptimes, keeps rows headed for the stop itself, and carries the service date', async () => {
  const mock = mockFetch({
    json: {
      stop: {
        gtfsId: 'U1',
        name: 'Main',
        wheelchairBoarding: 'POSSIBLE',
        stoptimesWithoutPatterns: [
          departureRow({
            serviceDate: '2026-07-19',
            realtimeDeparture: 90,
            realtime: true,
            realtimeState: 'UPDATED',
            typicalDelay: 45,
            stopPosition: 7,
            pickupType: 'COORDINATE_WITH_DRIVER',
            dropoffType: 'NONE',
            headsign: 'Center',
            stop: { gtfsId: '1:U1Z2', platformCode: '2' },
            trip: {
              gtfsId: '1:t1',
              bikesAllowed: 'ALLOWED',
              wheelchairAccessible: 'POSSIBLE',
              route: { gtfsId: '1:L5', shortName: '5', longName: 'Line 5', mode: 'BUS', color: '00A0E0', textColor: '000000' },
            },
          }),
          departureRow({
            scheduledDeparture: 120,
            realtimeDeparture: 120,
            headsign: 'Main',
            trip: {
              gtfsId: '1:t2',
              bikesAllowed: 'NO_INFORMATION',
              wheelchairAccessible: 'NO_INFORMATION',
              route: { gtfsId: '1:L6', shortName: '6', longName: null, mode: 'TRAM', color: null, textColor: null },
            },
          }),
        ],
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.departures('U1', 5, { startTime: 1_784_534_400_000 });

  assert.equal(mock.calls[0].url, 'https://x/routing/v1/departures');
  assert.equal(mock.calls[0].method, 'POST');
  assert.equal(mock.calls[0].body, '{"id":"U1","numberOfDepartures":5,"startTime":1784534400,"timeRange":86400}');

  if (!result.isSuccess) throw new Error(result.error.code);
  // A headsign equal to the stop name is a real departure (e.g. a loop line), not a terminus row.
  assert.deepEqual(result.data.map((d) => d.tripGtfsId), ['1:t1', '1:t2']);
  const d = result.data[0];
  assert.equal(d.scheduledTimeEpochMs, 1_060_000);
  assert.equal(d.realtimeTimeEpochMs, 1_090_000);
  assert.equal(d.routeShortName, '5');
  assert.equal(d.mode, 'BUS');
  assert.equal(d.serviceDate, '2026-07-19');
  assert.equal(d.routeGtfsId, '1:L5');
  assert.equal(d.routeColor, '00A0E0');
  assert.equal(d.routeTextColor, '000000');
  assert.equal(d.stopGtfsId, '1:U1Z2');
  assert.equal(d.platformCode, '2');
  assert.equal(d.wheelchairAccessible, 'POSSIBLE');
  assert.equal(d.typicalDelaySeconds, 45);
  assert.equal(d.stopPosition, 7);
  assert.equal(d.pickupType, 'COORDINATE_WITH_DRIVER');
  assert.equal(d.dropoffType, 'NONE');
  // Null display fields and NO_INFORMATION stay null.
  const bare = result.data[1];
  assert.equal(bare.realtimeTimeEpochMs, 1_120_000);
  assert.equal(bare.isRealtime, false);
  assert.equal(bare.routeColor, null);
  assert.equal(bare.routeLongName, null);
  assert.equal(bare.stopGtfsId, '1:U1Z1');
  assert.equal(bare.platformCode, null);
  assert.equal(bare.wheelchairAccessible, null);
  assert.equal(bare.typicalDelaySeconds, null);
  assert.equal(bare.stopPosition, null);
  assert.equal(bare.pickupType, 'SCHEDULED');
  assert.equal(bare.dropoffType, 'SCHEDULED');
});

test('departures sends reliability only when set', async () => {
  const mock = mockFetch({ json: { stop: { gtfsId: 'U1', name: 'Main', stoptimesWithoutPatterns: [] } } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.departures('U1', 5);
  await client.routing.departures('U1', 5, { reliability: 'SAFE' });

  assert.equal(mock.calls[0].body, '{"id":"U1","numberOfDepartures":5,"timeRange":86400}');
  assert.equal(mock.calls[1].body, '{"id":"U1","numberOfDepartures":5,"timeRange":86400,"reliability":"SAFE"}');
});

test('trip POSTs to /routing/v1/trip and maps stops, geometry and enums', async () => {
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
            realtimeArrival: 60,
            realtimeDeparture: 65,
            realtime: false,
            realtimeState: 'SCHEDULED',
            typicalDelay: 30,
            stopPosition: 3,
            geometryIndex: 0,
            pickupType: 'SCHEDULED',
            dropoffType: 'CALL_AGENCY',
            stop: { gtfsId: '1:s1', name: 'Stop 1', lat: 49.1, lon: 16.6, wheelchairBoarding: 'POSSIBLE', platformCode: 'A', zoneId: '100' },
          },
          {
            serviceDay: SERVICE_DAY_2026_07_20,
            scheduledArrival: 120,
            scheduledDeparture: 120,
            realtimeArrival: 150,
            realtimeDeparture: 150,
            realtime: true,
            realtimeState: 'UPDATED',
            typicalDelay: null,
            stopPosition: 5,
            pickupType: null,
            dropoffType: null,
            stop: { gtfsId: '1:s2', name: 'Stop 2', lat: 49.2, lon: 16.7, wheelchairBoarding: 'NO_INFORMATION', platformCode: null, zoneId: null },
          },
        ],
        tripGeometry: { points: '_izlhA~rlgdF', length: 1 },
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.trip('t1', '2026-07-20');

  assert.equal(mock.calls[0].url, 'https://x/routing/v1/trip');
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
  assert.deepEqual(trip.stops.map((s) => s.stopPosition), [3, 5]);
  assert.deepEqual(trip.geometry[trip.stops[0].geometryIndex ?? -1], { lat: 38.5, lon: -120.2 });
  assert.equal(trip.stops[1].geometryIndex, null);
  assert.equal(trip.stops[0].pickupType, 'SCHEDULED');
  assert.equal(trip.stops[0].dropoffType, 'CALL_AGENCY');
  assert.equal(trip.stops[1].pickupType, null);
  assert.equal(trip.stops[1].dropoffType, null);
  assert.equal(trip.stops[0].scheduledArrivalEpochMs, (SERVICE_DAY_2026_07_20 + 60) * 1000);
  assert.equal(trip.stops[0].wheelchairBoarding, 'POSSIBLE');
  assert.equal(trip.stops[1].realtimeArrivalEpochMs, (SERVICE_DAY_2026_07_20 + 150) * 1000);
  assert.equal(trip.stops[1].isRealtime, true);
  assert.equal(trip.stops[1].platformCode, null);
  assert.equal(trip.stops[1].wheelchairBoarding, null);
  assert.equal(trip.geometry.length, 1);
});

const WIRE_VEHICLE = { id: '1:7103', label: '7103', wheelchairAccessible: 'POSSIBLE', airConditioning: true, wifi: false, cardPayment: true };
const MAPPED_VEHICLE = { id: '1:7103', label: '7103', wheelchairAccessible: 'POSSIBLE', airConditioning: true, wifi: false, cardPayment: true };
const UNKNOWN_VEHICLE = { id: null, label: null, wheelchairAccessible: 'NO_INFORMATION', airConditioning: null, wifi: null, cardPayment: null };

test('a plan leg maps its vehicle as TripVehicle, NO_INFORMATION and unknown features as null, and a null vehicle as null', async () => {
  const response = structuredClone(PLAN_RESPONSE) as unknown as { itineraries: { legs: Record<string, unknown>[] }[] };
  const leg = response.itineraries[0].legs[0];
  response.itineraries[0].legs = [
    { ...leg, vehicle: WIRE_VEHICLE },
    { ...leg, vehicle: UNKNOWN_VEHICLE },
    { ...leg, vehicle: null },
  ];
  const mock = mockFetch({ json: response });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B') });

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.deepEqual(result.data.edges[0].itinerary.legs.map((l) => l.vehicle), [
    MAPPED_VEHICLE,
    { id: null, label: null, wheelchairAccessible: null, airConditioning: null, wifi: null, cardPayment: null },
    null,
  ]);
});

test('departures and trip map their vehicle as TripVehicle, and a null vehicle as null', async () => {
  const boards = mockFetch({
    json: {
      stop: {
        gtfsId: 'U1',
        name: 'Main',
        stoptimesWithoutPatterns: [
          departureRow({ vehicle: { ...WIRE_VEHICLE, wheelchairAccessible: 'NOT_POSSIBLE' } }),
          departureRow({ vehicle: null }),
        ],
      },
    },
  });
  const departures = await new SpiderClient('https://x', 'k', { fetch: boards.fetch }).routing.departures('U1', 5);
  if (!departures.isSuccess) throw new Error(departures.error.code);
  assert.deepEqual(departures.data.map((d) => d.vehicle), [{ ...MAPPED_VEHICLE, wheelchairAccessible: 'NOT_POSSIBLE' }, null]);

  const withVehicle = mockFetch({ json: { trip: { ...TRIP_WITHOUT_STOPS.trip, vehicle: WIRE_VEHICLE } } });
  const trip = await new SpiderClient('https://x', 'k', { fetch: withVehicle.fetch }).routing.trip('1:t1', '2026-07-20');
  if (!trip.isSuccess) throw new Error(trip.error.code);
  assert.deepEqual(trip.data?.vehicle, MAPPED_VEHICLE);

  const without = mockFetch({ json: { trip: { ...TRIP_WITHOUT_STOPS.trip, vehicle: null } } });
  const bare = await new SpiderClient('https://x', 'k', { fetch: without.fetch }).routing.trip('1:t1', '2026-07-20');
  if (!bare.isSuccess) throw new Error(bare.error.code);
  assert.equal(bare.data?.vehicle, null);
});

test('trip sends reliability only when set', async () => {
  const mock = mockFetch({ json: TRIP_WITHOUT_STOPS });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.trip('t1', '2026-07-20');
  await client.routing.trip('t1', '2026-07-20', 'VERY_SAFE');

  assert.equal(mock.calls[0].body, '{"id":"t1","serviceDate":"2026-07-20"}');
  assert.equal(mock.calls[1].body, '{"id":"t1","serviceDate":"2026-07-20","reliability":"VERY_SAFE"}');
});

test('trip without a service date is bad_request without a request', async () => {
  const mock = mockFetch({ json: TRIP_WITHOUT_STOPS });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  // Required by the type; a plain-JS caller can still omit it.
  const untypedTrip = client.routing.trip.bind(client.routing) as unknown as (tripId: string) => ReturnType<typeof client.routing.trip>;

  const result = await untypedTrip('t1');

  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'serviceDate');
  }
  assert.equal(mock.calls.length, 0);
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

test('trip on a date it does not run keeps the requested service date', async () => {
  const mock = mockFetch({ json: TRIP_WITHOUT_STOPS });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.trip('t1', '2026-07-20');

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.serviceDate, '2026-07-20');
  assert.equal(result.data.stops.length, 0);
  assert.equal(result.data.geometry.length, 0);
  assert.equal(result.data.routeGtfsId, '1:L5');
  assert.equal(result.data.routeColor, null);
  assert.equal(result.data.headsign, null);
  assert.equal(result.data.wheelchairAccessible, null);
});

test('an unknown stop or trip id (a 200 with null) is not_found', async () => {
  const mock = mockFetch((req) => ({ json: req.url.endsWith('/routing/v1/departures') ? { stop: null } : { trip: null } }));
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const departures = await client.routing.departures('1:nope');
  assert.equal(departures.isSuccess, false);
  if (!departures.isSuccess) assert.equal(departures.error.code, 'not_found');

  const trip = await client.routing.trip('1:nope', '2026-07-20');
  assert.equal(trip.isSuccess, false);
  if (!trip.isSuccess) assert.equal(trip.error.code, 'not_found');
});

test('estimatedDelays GETs /routing/v1/estimated-delays with the trip run and stop, and maps each level by name', async () => {
  const mock = mockFetch({
    json: {
      estimatedDelays: [
        { reliability: 'VERY_SAFE', delay: 210 },
        { reliability: 'STANDARD', delay: 40 },
        { reliability: 'SAFE', delay: 95 },
      ],
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.estimatedDelays('1:t 1', '2026-07-20', 4);

  const call = mock.calls[0];
  assert.equal(call.method, 'GET');
  assert.equal(call.url, 'https://x/routing/v1/estimated-delays?tripId=1%3At+1&serviceDate=2026-07-20&stopPosition=4');
  assert.equal(call.headers.get('apikey'), 'k');
  assert.equal(call.headers.get('x-spider-contract-version'), CONTRACT_VERSION);
  assert.equal(call.headers.get('x-spider-sdk'), SDK_IDENTITY);
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.deepEqual(result.data, { standardSeconds: 40, safeSeconds: 95, verySafeSeconds: 210 });
});

test('estimatedDelays is a null success when the API has none', async () => {
  const mock = mockFetch({ json: { estimatedDelays: null } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.estimatedDelays('1:nope', '2026-07-20', 0);

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data, null);
});

test('estimatedDelays fails decoding when a level is missing or the body is not the table', async () => {
  for (const json of [
    { estimatedDelays: [{ reliability: 'STANDARD', delay: 40 }, { reliability: 'SAFE', delay: 95 }] },
    { estimatedDelays: [{ reliability: 'STANDARD', delay: 40 }, { reliability: 'SAFE', delay: 95 }, { reliability: 'VERY_SAFE', delay: null }] },
    { estimatedDelays: { STANDARD: 40 } },
    {},
  ]) {
    const client = new SpiderClient('https://x', 'k', { fetch: mockFetch({ json }).fetch });
    const result = await client.routing.estimatedDelays('1:t1', '2026-07-20', 0);
    assert.equal(result.isSuccess, false, JSON.stringify(json));
    if (!result.isSuccess) assert.equal(result.error.code, 'decoding');
  }
});

test('estimatedDelays rejects a malformed service date as bad_request without a request', async () => {
  const mock = mockFetch({ json: { estimatedDelays: null } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  for (const serviceDate of ['20260720', '2026-02-30', '']) {
    const result = await client.routing.estimatedDelays('1:t1', serviceDate, 0);
    assert.equal(result.isSuccess, false, serviceDate);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, 'serviceDate');
    }
  }
  assert.equal(mock.calls.length, 0);
});

test('an estimatedDelays 400 is bad_request on the field the server names', async () => {
  const mock = mockFetch({ status: 400, json: { code: 'bad_request', message: 'stopPosition is invalid', field: 'stopPosition' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.estimatedDelays('1:t1', '2026-07-20', -1);

  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'stopPosition');
  }
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
    assert.equal(result.error.message, `POST /routing/v1/plan -> 400: ${field} is out of range`);
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
    assert.equal(result.error.message, 'POST /routing/v1/departures -> 400: numberOfDepartures is out of range');
  }
});

test('a gateway declaring another contract major is not an error', async () => {
  const otherMajor = `${Number(CONTRACT_VERSION.split('.')[0]) + 1}.0.0`;
  const mock = mockFetch({ json: PLAN_RESPONSE, headers: { 'x-spider-contract-version': otherMajor } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.plan({ origin: Location.coordinate(1, 2), destination: Location.coordinate(3, 4) });
  assert.equal(result.isSuccess, true);
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
  leg.pickupType = 'BY_DRONE';
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
  assert.equal(mapped.pickupType, 'UNKNOWN');
  assert.equal(mapped.fromWheelchair, 'UNKNOWN');
  assert.equal(mapped.bikesAllowed, 'UNKNOWN');
});

test('routing errors decode contract 1.5\'s codes: OUTSIDE_BOUNDS, NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW, NO_DIRECT_MODE_CONNECTION', async () => {
  const errors = [
    { code: 'OUTSIDE_BOUNDS', description: 'origin outside bounds', inputField: 'FROM' },
    { code: 'LOCATION_NOT_FOUND', description: 'destination is unknown', inputField: 'TO' },
    { code: 'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW', description: 'no transit in window', inputField: 'DATE_TIME' },
    { code: 'NO_DIRECT_MODE_CONNECTION', description: 'no direct walk', inputField: null },
  ];
  const mock = mockFetch({ json: { ...structuredClone(PLAN_RESPONSE), itineraries: [], routingErrors: errors } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({ origin: Location.coordinate(48.5, 11.0), destination: Location.coordinate(48.6958, 16.637) });

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.deepEqual(result.data.routingErrors, errors);
});

test('departures and trip decode unknown realtime states and modes to UNKNOWN', async () => {
  const mock = mockFetch({
    json: {
      stop: {
        gtfsId: 'U1',
        name: 'Main',
        stoptimesWithoutPatterns: [
          departureRow({
            realtimeState: 'DELAYED',
            trip: {
              gtfsId: '1:t1',
              bikesAllowed: 'NO_INFORMATION',
              wheelchairAccessible: 'NO_INFORMATION',
              route: { gtfsId: '1:r1', shortName: null, longName: null, mode: 'HOVERCRAFT', color: null, textColor: null },
            },
          }),
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

test('departures sends excludeModes only when a real mode is excluded', async () => {
  const mock = mockFetch({ json: { stop: { gtfsId: 'U1', name: 'Main', stoptimesWithoutPatterns: [] } } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.departures('U1', 5, { excludedModes: ['TRAM', 'WALK', 'UNKNOWN', 'BUS'] });
  await client.routing.departures('U1', 5, { excludedModes: [] });
  await client.routing.departures('U1', 5, { excludedModes: ['WALK', 'UNKNOWN'] });

  assert.equal(mock.calls[0].body, '{"id":"U1","numberOfDepartures":5,"timeRange":86400,"excludeModes":["TRAM","BUS"]}');
  assert.equal(mock.calls[1].body, '{"id":"U1","numberOfDepartures":5,"timeRange":86400}');
  assert.equal(mock.calls[2].body, '{"id":"U1","numberOfDepartures":5,"timeRange":86400}');
});

test('plan sends excludedTransitModes as modes.transit.exclude, without WALK/UNKNOWN', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ends = { origin: Location.stop('1:A'), destination: Location.stop('1:B'), departAt: new Date('2026-07-20T08:00:00Z') };

  await client.routing.plan({ ...ends, excludedTransitModes: ['TRAM', 'WALK', 'UNKNOWN', 'RAIL'] });
  await client.routing.plan({ ...ends, excludedTransitModes: [] });
  await client.routing.plan({ ...ends, excludedTransitModes: ['WALK', 'UNKNOWN'] });
  await client.routing.plan({ ...ends, allowedTransitModes: ['WALK'], excludedTransitModes: ['TRAM'] });

  const prefix = '{"dateTime":{"earliestDeparture":"2026-07-20T08:00:00.000Z"},'
    + '"origin":{"location":{"stopLocation":{"stopLocationId":"1:A"}}},'
    + '"destination":{"location":{"stopLocation":{"stopLocationId":"1:B"}}},';
  assert.equal(mock.calls[0].body, prefix + '"modes":{"transit":{"exclude":["TRAM","RAIL"]}},"searchWindow":"PT60M"}');
  assert.equal(mock.calls[1].body, prefix + '"searchWindow":"PT60M"}');
  assert.equal(mock.calls[2].body, prefix + '"searchWindow":"PT60M"}');
  assert.equal(mock.calls[3].body, prefix + '"modes":{"transit":{"exclude":["TRAM"]}},"searchWindow":"PT60M"}');
});

test('planNext and planPrevious resend excludedTransitModes', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const first = await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B'), excludedTransitModes: ['BUS'] });
  if (!first.isSuccess) throw new Error(first.error.code);
  await client.routing.planNext(first.data);
  await client.routing.planPrevious(first.data);

  assert.equal(mock.calls.length, 3);
  for (const call of mock.calls) assert.deepEqual(bodyOf(call).modes, { transit: { exclude: ['BUS'] } });
});

test('plan with both allowed and excluded transit modes is bad_request on modes.transit without a request', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({
    origin: Location.stop('1:A'),
    destination: Location.stop('1:B'),
    allowedTransitModes: ['BUS'],
    excludedTransitModes: ['TRAM'],
  });

  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'modes.transit');
    assert.equal(result.error.message, 'modes.transit is invalid');
  }
  assert.equal(mock.calls.length, 0);
});

test('trip sends startTime only when set, and rejects a malformed one without a request', async () => {
  const mock = mockFetch({ json: TRIP_WITHOUT_STOPS });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.trip('t1', '2026-07-20', undefined, '8:10:00');
  await client.routing.trip('t1', '2026-07-20', 'SAFE', '25:10:00');
  await client.routing.trip('t1', '2026-07-20', undefined, '');

  assert.equal(mock.calls[0].body, '{"id":"t1","serviceDate":"2026-07-20","startTime":"8:10:00"}');
  assert.equal(mock.calls[1].body, '{"id":"t1","serviceDate":"2026-07-20","startTime":"25:10:00","reliability":"SAFE"}');
  assert.equal(mock.calls[2].body, '{"id":"t1","serviceDate":"2026-07-20"}');

  const result = await client.routing.trip('t1', '2026-07-20', undefined, '08:10');
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'startTime');
    assert.equal(result.error.message, 'startTime is invalid');
  }
  assert.equal(mock.calls.length, 3);
});

test('estimatedDelays sends startTime only when set, and rejects a malformed one without a request', async () => {
  const mock = mockFetch({ json: { estimatedDelays: null } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.estimatedDelays('1:t1', '2026-07-20', 4, '08:10:00');
  await client.routing.estimatedDelays('1:t1', '2026-07-20', 4, '');

  assert.equal(mock.calls[0].url, 'https://x/routing/v1/estimated-delays?tripId=1%3At1&serviceDate=2026-07-20&stopPosition=4&startTime=08%3A10%3A00');
  assert.equal(mock.calls[1].url, 'https://x/routing/v1/estimated-delays?tripId=1%3At1&serviceDate=2026-07-20&stopPosition=4');

  const result = await client.routing.estimatedDelays('1:t1', '2026-07-20', 4, '8:1:00');
  assert.equal(result.isSuccess, false);
  if (!result.isSuccess) {
    assert.equal(result.error.code, 'bad_request');
    assert.equal(result.error.field, 'startTime');
  }
  assert.equal(mock.calls.length, 2);
});

test('plan with no or empty preferences sends exactly the body without them', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const options = {
    origin: Location.stop('1:A'),
    destination: Location.stop('1:B'),
    departAt: new Date('2026-07-20T08:00:00Z'),
    maxTransfers: 1,
    wheelchairAccessible: true,
  };

  await client.routing.plan(options);
  await client.routing.plan({ ...options, preferences: {} });
  await client.routing.plan({ ...options, preferences: { excludedRoutes: [], excludedAgencies: [] } });
  await client.routing.plan({ ...options, transitOnly: false });

  assert.equal(mock.calls.length, 4);
  for (const call of mock.calls) assert.equal(call.body, mock.calls[0].body);
  assert.deepEqual(bodyOf(mock.calls[0]).preferences, {
    transit: { transfer: { maximumTransfers: 2 } },
    accessibility: { wheelchair: { enabled: true } },
  });
});

test('plan sends every preference at its contract path beside maximumTransfers and wheelchair', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.plan({
    origin: Location.stop('1:A'),
    destination: Location.stop('1:B'),
    maxTransfers: 2,
    wheelchairAccessible: true,
    preferences: {
      walkSpeed: 1.2,
      walkReluctance: 4.5,
      boardCost: 600,
      transferCost: 300,
      transferSlackSeconds: 120,
      waitReluctance: 0.5,
      boardSlackSeconds: 30,
      alightSlackSeconds: 3600,
      excludedRoutes: ['1:L4', '1:L9'],
      excludedAgencies: ['1:DPMB'],
    },
  });

  assert.equal(
    JSON.stringify(bodyOf(mock.calls[0]).preferences),
    '{"street":{"walk":{"speed":1.2,"reluctance":4.5,"boardCost":600}},'
      + '"transit":{"transfer":{"cost":300,"slack":"PT120S","maximumTransfers":3},'
      + '"board":{"waitReluctance":0.5,"slack":"PT30S"},"alight":{"slack":"PT3600S"},'
      + '"filters":[{"exclude":[{"routes":["1:L4","1:L9"]},{"agencies":["1:DPMB"]}]}]},'
      + '"accessibility":{"wheelchair":{"enabled":true}}}',
  );
});

test('plan sends a single preference as only its own branch', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ends = { origin: Location.stop('1:A'), destination: Location.stop('1:B') };

  await client.routing.plan({ ...ends, preferences: { transferSlackSeconds: 0 } });
  await client.routing.plan({ ...ends, preferences: { walkSpeed: 0.1 } });
  await client.routing.plan({ ...ends, preferences: { excludedRoutes: [], excludedAgencies: ['1:A'] } });
  await client.routing.plan({ ...ends, preferences: { boardSlackSeconds: 90 } });

  assert.deepEqual(mock.calls.map((c) => bodyOf(c).preferences), [
    { transit: { transfer: { slack: 'PT0S' } } },
    { street: { walk: { speed: 0.1 } } },
    { transit: { filters: [{ exclude: [{ agencies: ['1:A'] }] }] } },
    { transit: { board: { slack: 'PT90S' } } },
  ]);
});

test('plan rejects a preference out of its contract range as bad_request on its path without a request', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  for (const [preferences, field] of OUT_OF_RANGE_PREFERENCES) {
    const result = await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B'), preferences });
    assert.equal(result.isSuccess, false, field);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, field);
      assert.equal(result.error.message, `${field} is out of range`);
    }
  }
  assert.equal(mock.calls.length, 0);

  const inRange = await client.routing.plan({
    origin: Location.stop('1:A'),
    destination: Location.stop('1:B'),
    preferences: {
      walkSpeed: 0.1,
      walkReluctance: 100_000,
      boardCost: 0,
      transferCost: 1_000_000,
      transferSlackSeconds: 3600,
      waitReluctance: 0.1,
      boardSlackSeconds: 0,
      alightSlackSeconds: 3600,
    },
  });
  assert.equal(inRange.isSuccess, true);
});

test('plan sends transitOnly as modes.transitOnly beside the mode filters, and nothing when false', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ends = { origin: Location.stop('1:A'), destination: Location.stop('1:B') };

  await client.routing.plan({ ...ends, transitOnly: true });
  await client.routing.plan({ ...ends, transitOnly: true, excludedTransitModes: ['TRAM'] });
  await client.routing.plan({ ...ends, transitOnly: true, allowedTransitModes: ['BUS'] });
  await client.routing.plan({ ...ends, transitOnly: false });

  assert.equal(JSON.stringify(bodyOf(mock.calls[0]).modes), '{"transitOnly":true}');
  assert.equal(JSON.stringify(bodyOf(mock.calls[1]).modes), '{"transitOnly":true,"transit":{"exclude":["TRAM"]}}');
  assert.equal(JSON.stringify(bodyOf(mock.calls[2]).modes), '{"transitOnly":true,"transit":{"transit":[{"mode":"BUS"}]}}');
  assert.equal('modes' in bodyOf(mock.calls[3]), false);
});

test('planNext and planPrevious resend preferences and transitOnly', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const first = await client.routing.plan({
    origin: Location.stop('1:A'),
    destination: Location.stop('1:B'),
    transitOnly: true,
    preferences: { walkSpeed: 1, transferSlackSeconds: 180, excludedRoutes: ['1:L4'] },
  });
  if (!first.isSuccess) throw new Error(first.error.code);
  await client.routing.planNext(first.data);
  await client.routing.planPrevious(first.data);
  await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B') });

  const expected = {
    street: { walk: { speed: 1 } },
    transit: { transfer: { slack: 'PT180S' }, filters: [{ exclude: [{ routes: ['1:L4'] }] }] },
  };
  const bodies = mock.calls.map(bodyOf);
  assert.deepEqual(bodies.map((b) => b.preferences), [expected, expected, expected, undefined]);
  assert.deepEqual(bodies.map((b) => b.modes), [{ transitOnly: true }, { transitOnly: true }, { transitOnly: true }, undefined]);
});

test('numberOfItineraries is first on the first page and after a cursor, last before one, and kept unless overridden', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const sized = await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B'), numberOfItineraries: 3 });
  if (!sized.isSuccess) throw new Error(sized.error.code);
  await client.routing.planNext(sized.data);
  await client.routing.planPrevious(sized.data);
  const next = await client.routing.planNext(sized.data, 1);
  if (next == null || !next.isSuccess) throw new Error('expected a next page');
  await client.routing.planPrevious(sized.data, null);
  await client.routing.planNext(next.data);
  await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B') });

  const bodies = mock.calls.map(bodyOf);
  assert.deepEqual(bodies.map((b) => [b.first, b.last]), [
    [3, undefined],
    [3, undefined],
    [undefined, 3],
    [1, undefined],
    [undefined, undefined],
    [1, undefined],
    [undefined, undefined],
  ]);
  assert.deepEqual(bodies.map((b) => b.after), [undefined, 'c-end', undefined, 'c-end', undefined, 'c-end', undefined]);
  assert.deepEqual(bodies.map((b) => b.before), [undefined, undefined, 'c-start', undefined, 'c-start', undefined, undefined]);
});

test('plan sends modeReluctance as modes.transit.costs in TransitMode order, beside exclude', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ends = { origin: Location.stop('1:A'), destination: Location.stop('1:B') };

  await client.routing.plan({
    ...ends,
    excludedTransitModes: ['RAIL'],
    preferences: { modeReluctance: { TRAM: 0.5, BUS: 2, RAIL: 3 } },
  });
  await client.routing.plan({ ...ends, preferences: { modeReluctance: { TROLLEYBUS: 100_000, AIRPLANE: 0.1, WALK: 4, UNKNOWN: 5 } } });

  assert.equal(
    JSON.stringify(bodyOf(mock.calls[0]).modes),
    '{"transit":{"exclude":["RAIL"],"costs":[{"mode":"BUS","reluctance":2},{"mode":"RAIL","reluctance":3},{"mode":"TRAM","reluctance":0.5}]}}',
  );
  assert.equal(
    JSON.stringify(bodyOf(mock.calls[1]).modes),
    '{"transit":{"costs":[{"mode":"AIRPLANE","reluctance":0.1},{"mode":"TROLLEYBUS","reluctance":100000}]}}',
  );
});

test('plan folds modeReluctance into the allowed list and drops a mode not allowed, never sending costs', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  await client.routing.plan({
    origin: Location.stop('1:A'),
    destination: Location.stop('1:B'),
    allowedTransitModes: ['TRAM', 'BUS'],
    preferences: { modeReluctance: { BUS: 1.5, RAIL: 9 } },
  });

  assert.equal(
    JSON.stringify(bodyOf(mock.calls[0]).modes),
    '{"transit":{"transit":[{"mode":"TRAM"},{"mode":"BUS","cost":{"reluctance":1.5}}]}}',
  );
});

test('plan with no, empty or only non-transit modeReluctance sends no costs', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ends = { origin: Location.stop('1:A'), destination: Location.stop('1:B'), excludedTransitModes: ['TRAM'] } as const;

  await client.routing.plan(ends);
  await client.routing.plan({ ...ends, preferences: { modeReluctance: {} } });
  await client.routing.plan({ ...ends, preferences: { modeReluctance: { WALK: 2 } } });
  await client.routing.plan({ ...ends, preferences: { modeReluctance: { BUS: undefined } } });
  await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.stop('1:B'), preferences: { modeReluctance: {} } });

  for (const call of mock.calls.slice(0, 4)) assert.equal(call.body, mock.calls[0].body);
  assert.deepEqual(bodyOf(mock.calls[0]).modes, { transit: { exclude: ['TRAM'] } });
  assert.equal('modes' in bodyOf(mock.calls[4]), false);
  assert.equal('preferences' in bodyOf(mock.calls[4]), false);
});

test('plan rejects a mode reluctance out of range on its modes path without a request', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const ends = { origin: Location.stop('1:A'), destination: Location.stop('1:B') };
  const cases: [Parameters<typeof client.routing.plan>[0], string][] = [
    [{ ...ends, preferences: { modeReluctance: { BUS: 0.09 } } }, 'modes.transit.costs.reluctance'],
    [{ ...ends, preferences: { modeReluctance: { BUS: 100_001 } } }, 'modes.transit.costs.reluctance'],
    [{ ...ends, preferences: { modeReluctance: { TRAM: Number.NaN } } }, 'modes.transit.costs.reluctance'],
    [{ ...ends, preferences: { modeReluctance: { TRAM: Number.POSITIVE_INFINITY } } }, 'modes.transit.costs.reluctance'],
    [{ ...ends, allowedTransitModes: ['BUS'], preferences: { modeReluctance: { BUS: 0 } } }, 'modes.transit.transit.cost.reluctance'],
  ];

  for (const [options, field] of cases) {
    const result = await client.routing.plan(options);
    assert.equal(result.isSuccess, false, field);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'bad_request');
      assert.equal(result.error.field, field);
      assert.equal(result.error.message, `${field} is out of range`);
    }
  }
  assert.equal(mock.calls.length, 0);
});

test('planNext and planPrevious resend modeReluctance', async () => {
  const mock = mockFetch({ json: PLAN_RESPONSE });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const first = await client.routing.plan({
    origin: Location.stop('1:A'),
    destination: Location.stop('1:B'),
    excludedTransitModes: ['RAIL'],
    preferences: { modeReluctance: { TRAM: 0.5 } },
  });
  if (!first.isSuccess) throw new Error(first.error.code);
  await client.routing.planNext(first.data);
  await client.routing.planPrevious(first.data);

  const modes = { transit: { exclude: ['RAIL'], costs: [{ mode: 'TRAM', reluctance: 0.5 }] } };
  assert.deepEqual(mock.calls.map((c) => bodyOf(c).modes), [modes, modes, modes]);
});

test('plan maps each leg end stop parent station, null without one or at a coordinate', async () => {
  const leg = PLAN_RESPONSE.itineraries[0].legs[0];
  const mock = mockFetch({
    json: {
      ...PLAN_RESPONSE,
      itineraries: [{
        ...PLAN_RESPONSE.itineraries[0],
        legs: [
          {
            ...leg,
            from: { ...leg.from, stop: { ...leg.from.stop, parentStation: { gtfsId: '1:ST_A', name: 'Station A' } } },
            to: { ...leg.to, stop: { ...leg.to.stop, parentStation: null } },
          },
          { ...leg, mode: 'WALK', from: { name: 'B', stopPosition: null, stop: leg.to.stop }, to: { name: 'Destination', stopPosition: null, stop: null } },
        ],
      }],
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.plan({ origin: Location.stop('1:A'), destination: Location.coordinate(49.2, 16.6) });
  if (!result.isSuccess) throw new Error(result.error.code);
  const [ride, walk] = result.data.edges[0].itinerary.legs;
  assert.deepEqual(ride.fromParentStation, { gtfsId: '1:ST_A', name: 'Station A' });
  assert.equal(ride.toParentStation, null);
  assert.equal(walk.fromParentStation, null);
  assert.equal(walk.toParentStation, null);
});

test('trip maps each stop parent station, null without one', async () => {
  const stoptime = (stop: Record<string, unknown>) => ({
    serviceDay: 1000,
    scheduledArrival: 60,
    scheduledDeparture: 60,
    realtimeArrival: 60,
    realtimeDeparture: 60,
    realtime: false,
    realtimeState: 'SCHEDULED',
    typicalDelay: null,
    stopPosition: 1,
    pickupType: 'SCHEDULED',
    dropoffType: 'SCHEDULED',
    stop: { name: 'S', lat: 49.1, lon: 16.6, wheelchairBoarding: 'POSSIBLE', platformCode: null, zoneId: null, ...stop },
  });
  const mock = mockFetch({
    json: {
      trip: {
        ...TRIP_WITHOUT_STOPS.trip,
        stoptimesForDate: [
          stoptime({ gtfsId: '1:s1', parentStation: { gtfsId: '1:ST1', name: 'Station 1' } }),
          stoptime({ gtfsId: '1:s2', parentStation: null }),
        ],
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.trip('1:t1', '2026-07-20');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.deepEqual(result.data.stops.map((s) => s.parentStation), [{ gtfsId: '1:ST1', name: 'Station 1' }, null]);
});

test('stopDepartures sends the departures body and maps the stop with its parent station and departures', async () => {
  const mock = mockFetch({
    json: {
      stop: {
        gtfsId: '1:U1Z1',
        name: 'Main',
        wheelchairBoarding: 'POSSIBLE',
        parentStation: { gtfsId: '1:U1', name: 'Main station' },
        stoptimesWithoutPatterns: [departureRow({})],
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.stopDepartures('1:U1Z1', 5, { startTime: 1_784_534_400_000, reliability: 'SAFE' });
  await client.routing.departures('1:U1Z1', 5, { startTime: 1_784_534_400_000, reliability: 'SAFE' });

  assert.equal(mock.calls[0].url, 'https://x/routing/v1/departures');
  assert.equal(mock.calls[0].body, '{"id":"1:U1Z1","numberOfDepartures":5,"startTime":1784534400,"timeRange":86400,"reliability":"SAFE"}');
  assert.equal(mock.calls[1].body, mock.calls[0].body);
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.gtfsId, '1:U1Z1');
  assert.equal(result.data.name, 'Main');
  assert.equal(result.data.wheelchairBoarding, 'POSSIBLE');
  assert.deepEqual(result.data.parentStation, { gtfsId: '1:U1', name: 'Main station' });
  assert.deepEqual(result.data.departures.map((d) => d.tripGtfsId), ['1:t1']);
});

test('stopDepartures for a station has no parent station or wheelchair boarding', async () => {
  const mock = mockFetch({
    json: {
      stop: { gtfsId: '1:U1', name: 'Main station', wheelchairBoarding: null, parentStation: null, stoptimesWithoutPatterns: [departureRow({})] },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const result = await client.routing.stopDepartures('1:U1');
  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.gtfsId, '1:U1');
  assert.equal(result.data.wheelchairBoarding, null);
  assert.equal(result.data.parentStation, null);
  assert.equal(result.data.departures.length, 1);
});

test('departures returns the stopDepartures departures, and both fail alike on an unknown id or a bad timeRange', async () => {
  const board = { gtfsId: '1:U1Z1', name: 'Main', wheelchairBoarding: 'POSSIBLE', parentStation: { gtfsId: '1:U1', name: 'Main station' }, stoptimesWithoutPatterns: [departureRow({})] };
  const known = mockFetch({ json: { stop: board } });
  const client = new SpiderClient('https://x', 'k', { fetch: known.fetch });
  const departures = await client.routing.departures('1:U1Z1');
  const withStop = await client.routing.stopDepartures('1:U1Z1');
  if (!departures.isSuccess || !withStop.isSuccess) throw new Error('expected success');
  assert.ok(Array.isArray(departures.data));
  assert.deepEqual(departures.data, withStop.data.departures);

  const unknown = new SpiderClient('https://x', 'k', { fetch: mockFetch({ json: { stop: null } }).fetch });
  for (const result of [await unknown.routing.departures('1:nope'), await unknown.routing.stopDepartures('1:nope')]) {
    assert.equal(result.isSuccess, false);
    if (!result.isSuccess) {
      assert.equal(result.error.code, 'not_found');
      assert.equal(result.error.message, 'routing returned no stop or station for id=1:nope');
    }
  }

  const range = await client.routing.stopDepartures('1:U1Z1', 5, { timeRangeSeconds: 0 });
  assert.equal(range.isSuccess, false);
  if (!range.isSuccess) assert.equal(range.error.field, 'timeRange');
  assert.equal(known.calls.length, 2);
});
