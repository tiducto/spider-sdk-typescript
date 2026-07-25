import test from 'node:test';
import assert from 'node:assert/strict';
import { Location, SpiderClient, SpiderContractMismatchError } from '../src/index.ts';
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
                start: { scheduledTime: '2026-07-20T08:00:00Z' },
                end: { scheduledTime: '2026-07-20T08:15:00Z' },
                from: { name: 'A', stop: { wheelchairBoarding: 'POSSIBLE' } },
                to: { name: 'B', stop: { wheelchairBoarding: 'NOT_POSSIBLE' } },
                route: { shortName: '1', longName: 'Line 1' },
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
    first: 3,
  });

  assert.equal(mock.calls.length, 1);
  const call = mock.calls[0];
  assert.equal(call.url, 'https://brno.api.tiducto.eu/routing/plan');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.get('apikey'), 'k');
  assert.equal(call.headers.get('x-spider-contract-version'), '1.0.0');

  const body = JSON.parse(call.body);
  assert.equal(body.id, 'f19608964d423831b485ccc878cb25eff56c720585d4423ee617c864e2b3102e');
  assert.equal(body.variables.first, 3);
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
  assert.equal(leg.bikesAllowed, 'Allowed');
  assert.equal(leg.fromWheelchair, 'Possible');
  assert.equal(leg.toWheelchair, 'NotPossible');
  assert.ok(leg.geometry.length > 0);
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

test('departures maps stoptimes and drops sibling-terminating trips', async () => {
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
              trip: { gtfsId: 't1', route: { shortName: '5', longName: 'Line 5', mode: 'BUS' } },
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
  assert.equal(body.id, '70a644fe3c6b2cbf5b2d70cef8230c1428bea6357ae1766772162d86469563d0');
  assert.equal(body.variables.numberOfDepartures, 5);

  if (!result.isSuccess) throw new Error(result.error.code);
  assert.equal(result.data.length, 1);
  const d = result.data[0];
  assert.equal(d.scheduledTimeEpochMs, 1_060_000);
  assert.equal(d.realtimeTimeEpochMs, 1_090_000);
  assert.equal(d.routeShortName, '5');
  assert.equal(d.mode, 'BUS');
});

test('trip maps stops, geometry and enums', async () => {
  const mock = mockFetch({
    json: {
      data: {
        trip: {
          gtfsId: 't1',
          route: { shortName: '5', longName: 'Line 5', mode: 'BUS' },
          directionId: '0',
          tripHeadsign: 'Center',
          bikesAllowed: 'ALLOWED',
          stoptimesForDate: [
            {
              serviceDay: 1000,
              scheduledArrival: 60,
              scheduledDeparture: 65,
              realtime: false,
              stop: { gtfsId: 's1', name: 'Stop 1', lat: 49.1, lon: 16.6, wheelchairBoarding: 'POSSIBLE' },
            },
          ],
          tripGeometry: { points: '_p~iF~ps|U', length: 1 },
        },
      },
    },
  });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const result = await client.routing.trip('t1');

  if (!result.isSuccess) throw new Error(result.error.code);
  const trip = result.data;
  assert.equal(trip.gtfsId, 't1');
  assert.equal(trip.mode, 'BUS');
  assert.equal(trip.bikesAllowed, 'Allowed');
  assert.equal(trip.stops.length, 1);
  assert.equal(trip.stops[0].name, 'Stop 1');
  assert.equal(trip.stops[0].scheduledArrivalEpochMs, 1_060_000);
  assert.equal(trip.stops[0].wheelchairBoarding, 'Possible');
  assert.equal(trip.geometry.length, 1);
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

test('a contract-version mismatch throws instead of returning a result', async () => {
  const mock = mockFetch({ json: PLAN_ENVELOPE, headers: { 'x-spider-contract-version': '2.0.0' } });
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  await assert.rejects(
    client.routing.plan({ origin: Location.coordinate(1, 2), destination: Location.coordinate(3, 4) }),
    (err) => err instanceof SpiderContractMismatchError,
  );
});
