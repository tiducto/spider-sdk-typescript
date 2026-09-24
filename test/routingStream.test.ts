import test from 'node:test';
import assert from 'node:assert/strict';
import { Location, SpiderClient, ViaLocation } from '../src/index.ts';
import type { PlanStreamEvent } from '../src/index.ts';
import { parsePlanStreamRecord } from '../src/routing.ts';
import { PLAN_STREAM } from '../src/persistedQueries.ts';
import type { FetchLike } from '../src/http.ts';
import type { Captured } from './support.ts';

// Guards the SSE `plan-stream` handling: the record parser that turns `chunk`/`pageInfo`/`error` frames into
// the three PlanStreamEvents (`result`/`done`/`failure`, including realtime-delay mapping onto legs), and the
// end-to-end request (persisted-query id + variables wire shape) and framing over a streamed response.

// A `chunk` frame → a `result` event carrying itinerary nodes; realtime delays ride on each leg's
// estimated{time,delay} + realtimeState + realTime + serviceDate and must land on the domain Leg exactly as
// the batch plan maps them.
test('chunk maps itineraries with realtime delays', () => {
  const data = JSON.stringify({
    frontier: 1800,
    found: 3,
    finalized: 1,
    results: [
      {
        numberOfTransfers: 1,
        start: '2026-07-15T08:00:00Z',
        end: '2026-07-15T08:30:00Z',
        duration: 1800,
        legs: [
          {
            mode: 'BUS',
            start: { scheduledTime: '2026-07-15T08:00:00Z', estimated: { time: '2026-07-15T08:01:00Z', delay: 'PT60S' } },
            end: { scheduledTime: '2026-07-15T08:30:00Z', estimated: { time: '2026-07-15T08:32:00Z', delay: 'PT120S' } },
            realtimeState: 'UPDATED',
            realTime: true,
            serviceDate: '20260715',
            from: { name: 'Origin', stop: { gtfsId: '1:A' } },
            to: { name: 'Dest', stop: { gtfsId: '1:B' } },
            route: { shortName: '12' },
            trip: { gtfsId: '1:T' },
          },
        ],
      },
    ],
  });

  const event = parsePlanStreamRecord('chunk', data);
  assert.equal(event?.type, 'result');
  if (event?.type !== 'result') return;

  const itinerary = event.itineraries[0];
  assert.equal(itinerary.numberOfTransfers, 1);
  assert.equal(itinerary.durationSeconds, 1800);

  const leg = itinerary.legs[0];
  assert.equal(leg.mode, 'BUS');
  assert.equal(leg.startDelaySeconds, 60);
  assert.equal(leg.endDelaySeconds, 120);
  assert.equal(leg.startEstimated, '2026-07-15T08:01:00Z');
  assert.equal(leg.isRealtime, true);
  assert.equal(leg.realtimeState, 'UPDATED');
  assert.equal(leg.serviceDate, '20260715');
  assert.equal(leg.fromName, 'Origin');
});

// The `pageInfo` frame is the terminal `done` event — it carries the continuation RoutePageInfo.
test('pageInfo maps to the terminal done with continuation cursors', () => {
  const data = JSON.stringify({ startCursor: 'c-prev', endCursor: 'c-next', hasNextPage: true, hasPreviousPage: false, searchWindowUsed: 'PT1H' });
  const event = parsePlanStreamRecord('pageInfo', data);
  assert.equal(event?.type, 'done');
  if (event?.type !== 'done') return;
  assert.equal(event.pageInfo.startCursor, 'c-prev');
  assert.equal(event.pageInfo.endCursor, 'c-next');
  assert.equal(event.pageInfo.hasNextPage, true);
  assert.equal(event.pageInfo.hasPreviousPage, false);
  assert.equal(event.pageInfo.searchWindowUsed, 'PT1H');
});

// The wire `done` telemetry frame just ends the stream — it is dropped, not surfaced as an event.
test('done frame is dropped', () => {
  const data = JSON.stringify({ iterations: 3, windowSeconds: 3600, resultCount: 5, stoppedBy: 'targetResults' });
  assert.equal(parsePlanStreamRecord('done', data), null);
});

// A stream `error` record is the GraphQL error envelope; a top-level BAD_REQUEST becomes a typed bad_request.
test('error event maps to a typed bad_request failure', () => {
  const data = JSON.stringify({ data: null, errors: [{ message: 'searchWindow exceeds the cap', extensions: { code: 'BAD_REQUEST', field: 'searchWindow' } }] });
  const event = parsePlanStreamRecord('error', data);
  assert.equal(event?.type, 'failure');
  if (event?.type !== 'failure') return;
  assert.equal(event.error.code, 'bad_request');
  assert.equal(event.error.field, 'searchWindow');
  assert.equal(event.error.message, 'searchWindow exceeds the cap');
});

test('heartbeats and unknown events are ignored', () => {
  assert.equal(parsePlanStreamRecord('message', ''), null);
  assert.equal(parsePlanStreamRecord('weird', JSON.stringify({ x: 1 })), null);
});

// Feeds an SSE byte stream through the full planStream: pins the request (persisted id + variables wire shape),
// that it opens a fresh stream (no cursors), and that framing across read boundaries yields result → done in
// order (the wire `done` telemetry frame is dropped).
test('planStream posts the persisted query and streams result then done events', async () => {
  const frames = [
    'event: chunk\ndata: {"results":[{"numberOfTransfers":0,"start":"2026-07-15T08:00:00Z","end":"2026-07-15T08:20:00Z","duration":1200,"legs":[]}]}\n\n',
    // A record split across two reads exercises the cross-chunk buffering.
    'event: pageInfo\ndata: {"startCursor":"a","endCursor":',
    '"b","hasNextPage":true,"hasPreviousPage":false}\n\n',
    'event: done\ndata: {"iterations":2,"windowSeconds":1800,"resultCount":1,"stoppedBy":"targetResults"}\n\n',
  ];
  const mock = sseFetch(frames);
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const events: PlanStreamEvent[] = [];
  for await (const ev of client.routing.planStream({
    origin: Location.stop('1:A'),
    destination: Location.coordinate(49.2, 16.6),
    via: [ViaLocation.passThrough('1:V')],
    targetResults: 5,
    maxWindowMinutes: 180,
  })) {
    events.push(ev);
  }

  assert.equal(mock.calls.length, 1);
  const call = mock.calls[0];
  assert.equal(call.url, 'https://brno.api.tiducto.eu/routing/plan-stream');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.get('apikey'), 'k');
  const body = JSON.parse(call.body);
  assert.equal(body.id, PLAN_STREAM.id);
  assert.deepEqual(body.variables.origin, { location: { stopLocation: { stopLocationId: '1:A' } } });
  assert.deepEqual(body.variables.via, [{ passThrough: { stopLocationIds: ['1:V'] } }]);
  assert.equal(body.variables.targetResults, 5);
  assert.equal(body.variables.maxWindow, 'PT180M');
  // A fresh stream sends no continuation cursors.
  assert.equal(body.variables.after, undefined);
  assert.equal(body.variables.before, undefined);

  assert.deepEqual(events.map((e) => e.type), ['result', 'done']);
  const [result, done] = events;
  assert.equal(result.type === 'result' && result.itineraries.length, 1);
  assert.equal(done.type === 'done' && done.pageInfo.endCursor, 'b');
  assert.equal(done.type === 'done' && done.pageInfo.hasNextPage, true);
});

// planStreamNext continues a stream forward: same options plus a raw `endCursor`, sent as `after`.
test('planStreamNext continues forward from a done endCursor via after', async () => {
  const frames = ['event: pageInfo\ndata: {"startCursor":"n0","endCursor":"n1","hasNextPage":false,"hasPreviousPage":true}\n\n'];
  const mock = sseFetch(frames);
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const events: PlanStreamEvent[] = [];
  for await (const ev of client.routing.planStreamNext(
    { origin: Location.stop('1:A'), destination: Location.stop('1:B'), targetResults: 8, maxWindowMinutes: 120 },
    'cursor-end',
  )) {
    events.push(ev);
  }

  assert.equal(mock.calls.length, 1);
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.id, PLAN_STREAM.id);
  assert.equal(body.variables.after, 'cursor-end');
  assert.equal(body.variables.before, undefined);
  assert.equal(body.variables.targetResults, 8);
  assert.equal(body.variables.maxWindow, 'PT120M');
  assert.deepEqual(events.map((e) => e.type), ['done']);
});

// planStreamPrevious continues a stream backward: same options plus a raw `startCursor`, sent as `before`.
test('planStreamPrevious continues backward from a done startCursor via before', async () => {
  const frames = ['event: pageInfo\ndata: {"startCursor":"p0","endCursor":"p1","hasNextPage":true,"hasPreviousPage":false}\n\n'];
  const mock = sseFetch(frames);
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const events: PlanStreamEvent[] = [];
  for await (const ev of client.routing.planStreamPrevious(
    { origin: Location.stop('1:A'), destination: Location.stop('1:B') },
    'cursor-start',
  )) {
    events.push(ev);
  }

  assert.equal(mock.calls.length, 1);
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.variables.before, 'cursor-start');
  assert.equal(body.variables.after, undefined);
  assert.deepEqual(events.map((e) => e.type), ['done']);
});

test('planStream surfaces a non-2xx response as a single failure event', async () => {
  const fetch: FetchLike = async () => new Response('forbidden', { status: 403 });
  const client = new SpiderClient('https://x', 'k', { fetch });

  const events: PlanStreamEvent[] = [];
  for await (const ev of client.routing.planStream({ origin: Location.stop('1:A'), destination: Location.stop('1:B') })) {
    events.push(ev);
  }

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'failure');
  if (events[0].type !== 'failure') return;
  assert.equal(events[0].error.code, 'unauthorized');
  assert.equal(events[0].error.httpStatus, 403);
});

function sseFetch(frames: readonly string[]): { fetch: FetchLike; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  };
  return { fetch: fetch as FetchLike, calls };
}
