import test from 'node:test';
import assert from 'node:assert/strict';
import { Location, SpiderClient, ViaLocation } from '../src/index.ts';
import type { PlanStreamEvent, PlanStreamRequestOptions } from '../src/index.ts';
import { parsePlanStreamRecord } from '../src/routing.ts';
import type { FetchLike } from '../src/http.ts';
import type { Captured } from './support.ts';

const STREAM_OPTIONS: PlanStreamRequestOptions = {
  origin: Location.stop('1:A'),
  destination: Location.stop('1:B'),
  targetResults: 5,
  maxWindowMinutes: 180,
};

const PAGE_INFO_FRAME = 'event: pageInfo\ndata: {"startCursor":"s","endCursor":"e","hasNextPage":true,"hasPreviousPage":false,"searchWindowUsed":"PT2H","routingErrors":[]}\n\n';
const DONE_FRAME = 'event: done\ndata: {"iterations":2,"windowSeconds":7200,"resultCount":1,"stoppedBy":"targetResults"}\n\n';

// Guards the SSE `plan-stream` handling: the record parser that turns `chunk`/`pageInfo` frames into the
// PlanStreamEvents (`result`/`done`, including realtime-delay mapping onto legs) and ignores every other event,
// and the end-to-end request (REST path + body) and framing over a streamed response.

// A `chunk` frame → a `result` event carrying itineraries; realtime delays ride on each leg's
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
            typicalArrivalDelay: 75,
            realtimeState: 'UPDATED',
            realTime: true,
            serviceDate: '2026-07-15',
            from: { name: 'Origin', stop: { gtfsId: '1:A' } },
            to: { name: 'Dest', stop: { gtfsId: '1:B' } },
            route: { shortName: '12' },
            trip: { gtfsId: '1:T' },
            interlineWithPreviousLeg: true,
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
  assert.equal(itinerary.accessibilityScore, null);

  const leg = itinerary.legs[0];
  assert.equal(leg.mode, 'BUS');
  assert.equal(leg.startDelaySeconds, 60);
  assert.equal(leg.endDelaySeconds, 120);
  assert.equal(leg.startEstimated, '2026-07-15T08:01:00Z');
  assert.equal(leg.isRealtime, true);
  assert.equal(leg.realtimeState, 'UPDATED');
  assert.equal(leg.serviceDate, '2026-07-15');
  assert.equal(leg.typicalArrivalDelaySeconds, 75);
  assert.equal(leg.interlineWithPreviousLeg, true);
  assert.equal(leg.fromName, 'Origin');
  assert.equal(leg.fromGtfsId, '1:A');
  // Display fields the wire leaves out are null.
  assert.equal(leg.fromPlatformCode, null);
  assert.equal(leg.toZoneId, null);
  assert.equal(leg.routeGtfsId, null);
  assert.equal(leg.routeColor, null);
  assert.equal(leg.routeTextColor, null);
});

// The `pageInfo` frame is the terminal `done` event — it carries the continuation RoutePageInfo.
test('pageInfo maps to the terminal done with continuation cursors', () => {
  const data = JSON.stringify({ startCursor: 'c-prev', endCursor: 'c-next', hasNextPage: true, hasPreviousPage: false, searchWindowUsed: 'PT1H', routingErrors: [] });
  const event = parsePlanStreamRecord('pageInfo', data);
  assert.equal(event?.type, 'done');
  if (event?.type !== 'done') return;
  assert.equal(event.pageInfo.startCursor, 'c-prev');
  assert.equal(event.pageInfo.endCursor, 'c-next');
  assert.equal(event.pageInfo.hasNextPage, true);
  assert.equal(event.pageInfo.hasPreviousPage, false);
  assert.equal(event.pageInfo.searchWindowUsed, 'PT1H');
  assert.deepEqual(event.routingErrors, []);
});

// A declined plan reports why on its pageInfo, shaped like the batch plan's routingErrors.
test('pageInfo routingErrors map onto done like the batch plan', () => {
  const data = JSON.stringify({
    startCursor: null,
    endCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    searchWindowUsed: null,
    routingErrors: [
      { code: 'OUTSIDE_SERVICE_PERIOD', description: 'date is outside the feed', inputField: 'DATE_TIME' },
      { code: 'LOCATION_NOT_FOUND', description: 'unknown stop' },
    ],
  });
  const event = parsePlanStreamRecord('pageInfo', data);
  assert.equal(event?.type, 'done');
  if (event?.type !== 'done') return;
  assert.equal(event.pageInfo.searchWindowUsed, null);
  assert.deepEqual(event.routingErrors, [
    { code: 'OUTSIDE_SERVICE_PERIOD', description: 'date is outside the feed', inputField: 'DATE_TIME' },
    { code: 'LOCATION_NOT_FOUND', description: 'unknown stop', inputField: null },
  ]);
});

// The wire `done` telemetry frame just ends the stream — it is dropped, not surfaced as an event.
test('done frame is dropped', () => {
  const data = JSON.stringify({ iterations: 3, windowSeconds: 3600, resultCount: 5, stoppedBy: 'targetResults' });
  assert.equal(parsePlanStreamRecord('done', data), null);
});

// A new event name is additive: the SDK ignores what it does not know, `error` included.
test('heartbeats, error and other unknown events are ignored', () => {
  assert.equal(parsePlanStreamRecord('message', ''), null);
  assert.equal(parsePlanStreamRecord('weird', JSON.stringify({ x: 1 })), null);
  assert.equal(parsePlanStreamRecord('error', JSON.stringify({ code: 'bad_request', message: 'targetResults is required' })), null);
});

test('a malformed chunk is a terminal decoding failure', () => {
  const event = parsePlanStreamRecord('chunk', '{not json');
  assert.equal(event?.type === 'failure' && event.error.code, 'decoding');
});

// Feeds an SSE byte stream through the full planStream: pins the request (REST path, headers and the exact body),
// that it opens a fresh stream (no cursors), and that framing across read boundaries yields result → done in
// order (the wire `done` telemetry frame and unknown events are dropped).
test('planStream POSTs the REST body to /routing/v1/plan-stream and streams result then done events', async () => {
  const frames = [
    'event: chunk\ndata: {"frontier":600,"found":1,"finalized":1,"results":[{"numberOfTransfers":0,"start":"2026-07-15T08:00:00Z","end":"2026-07-15T08:20:00Z","duration":1200,"legs":[]}]}\n\n',
    'event: progress\ndata: {"frontier":1200}\n\n',
    // A record split across two reads exercises the cross-chunk buffering.
    'event: pageInfo\ndata: {"startCursor":"a","endCursor":',
    '"b","hasNextPage":true,"hasPreviousPage":false,"searchWindowUsed":"PT20M","routingErrors":[]}\n\n',
    DONE_FRAME,
  ];
  const mock = sseFetch(frames);
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const events = await collect(client.routing.planStream({
    origin: Location.stop('1:A'),
    destination: Location.coordinate(49.2, 16.6),
    departAt: new Date('2026-07-15T08:00:00Z'),
    via: [ViaLocation.passThrough('1:V')],
    targetResults: 5,
    maxWindowMinutes: 180,
    reliability: 'SAFE',
  }));

  assert.equal(mock.calls.length, 1);
  const call = mock.calls[0];
  assert.equal(call.url, 'https://brno.api.tiducto.eu/routing/v1/plan-stream');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.get('apikey'), 'k');
  assert.equal(call.headers.get('accept'), 'text/event-stream');
  assert.equal(call.headers.get('content-type'), 'application/json');
  // A fresh stream sends no continuation cursors.
  assert.equal(
    call.body,
    '{"dateTime":{"earliestDeparture":"2026-07-15T08:00:00.000Z"},'
      + '"origin":{"location":{"stopLocation":{"stopLocationId":"1:A"}}},'
      + '"destination":{"location":{"coordinate":{"latitude":49.2,"longitude":16.6}}},'
      + '"via":[{"passThrough":{"stopLocationIds":["1:V"]}}],'
      + '"targetResults":5,"maxWindow":"PT180M","reliability":"SAFE"}',
  );

  assert.deepEqual(events.map((e) => e.type), ['result', 'done']);
  const [result, done] = events;
  assert.equal(result.type === 'result' && result.itineraries.length, 1);
  assert.equal(done.type === 'done' && done.pageInfo.endCursor, 'b');
  assert.equal(done.type === 'done' && done.pageInfo.hasNextPage, true);
  assert.equal(done.type === 'done' && done.pageInfo.searchWindowUsed, 'PT20M');
});

// planStreamNext continues a stream forward: same options plus a raw `endCursor`, sent as `after`.
test('planStreamNext continues forward from a done endCursor via after', async () => {
  const mock = sseFetch([PAGE_INFO_FRAME, DONE_FRAME]);
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const events = await collect(client.routing.planStreamNext(
    { origin: Location.stop('1:A'), destination: Location.stop('1:B'), targetResults: 8, maxWindowMinutes: 120 },
    'cursor-end',
  ));

  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, 'https://brno.api.tiducto.eu/routing/v1/plan-stream');
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.after, 'cursor-end');
  assert.equal('before' in body, false);
  assert.equal(body.targetResults, 8);
  assert.equal(body.maxWindow, 'PT120M');
  // No reliability requested = plan on the timetable: the member is left out, not defaulted.
  assert.equal('reliability' in body, false);
  assert.deepEqual(events.map((e) => e.type), ['done']);
});

// planStreamPrevious continues a stream backward: same options plus a raw `startCursor`, sent as `before`.
test('planStreamPrevious continues backward from a done startCursor via before', async () => {
  const mock = sseFetch([PAGE_INFO_FRAME, DONE_FRAME]);
  const client = new SpiderClient('https://brno.api.tiducto.eu', 'k', { fetch: mock.fetch });

  const events = await collect(client.routing.planStreamPrevious({ ...STREAM_OPTIONS, reliability: 'VERY_SAFE' }, 'cursor-start'));

  assert.equal(mock.calls.length, 1);
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.before, 'cursor-start');
  assert.equal('after' in body, false);
  assert.equal(body.reliability, 'VERY_SAFE');
  assert.deepEqual(events.map((e) => e.type), ['done']);
});

test('planStream rejects a maxWindow under 2 h, or none, before any request', async () => {
  const mock = sseFetch([PAGE_INFO_FRAME, DONE_FRAME]);
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const cases: [PlanStreamRequestOptions, string][] = [
    [{ ...STREAM_OPTIONS, maxWindowMinutes: 119 }, 'maxWindow is out of range'],
    [{ ...STREAM_OPTIONS, maxWindowMinutes: Number.NaN }, 'maxWindow is out of range'],
    // A plain-JS caller can leave out a required option.
    [{ ...STREAM_OPTIONS, maxWindowMinutes: undefined as unknown as number }, 'maxWindow is required'],
  ];
  for (const [options, message] of cases) {
    const events = await collect(client.routing.planStream(options));
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.type === 'failure' && ev.error.code, 'bad_request');
    assert.equal(ev.type === 'failure' && ev.error.field, 'maxWindow');
    assert.equal(ev.type === 'failure' && ev.error.message, message);
  }
  assert.equal(mock.calls.length, 0);

  await collect(client.routing.planStream({ ...STREAM_OPTIONS, maxWindowMinutes: 120 }));
  assert.equal(JSON.parse(mock.calls[0].body).maxWindow, 'PT120M');
});

test('planStream and its continuations reject an out-of-range via before any request', async () => {
  const mock = sseFetch([]);
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  for (const [via, field] of [
    [ViaLocation.passThrough(), 'via'],
    [ViaLocation.visit(Location.stop('1:V'), 3601), 'via.visit.minimumWaitTime'],
  ] as const) {
    const options = { ...STREAM_OPTIONS, via: [via] };
    for (const stream of [
      client.routing.planStream(options),
      client.routing.planStreamNext(options, 'c'),
      client.routing.planStreamPrevious(options, 'c'),
    ]) {
      const [ev] = await collect(stream);
      assert.equal(ev.type === 'failure' && ev.error.field, field);
    }
  }
  assert.equal(mock.calls.length, 0);
});

test('planStream rejects a visit to a coordinate as via is invalid before any request', async () => {
  const mock = sseFetch([PAGE_INFO_FRAME, DONE_FRAME]);
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });
  const options = { ...STREAM_OPTIONS, via: [ViaLocation.visit(Location.coordinate(49.2, 16.6))] };

  for (const stream of [
    client.routing.planStream(options),
    client.routing.planStreamNext(options, 'c'),
    client.routing.planStreamPrevious(options, 'c'),
  ]) {
    const events = await collect(stream);
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.type, 'failure');
    if (ev.type === 'failure') {
      assert.equal(ev.error.code, 'bad_request');
      assert.equal(ev.error.field, 'via');
      assert.equal(ev.error.message, 'via is invalid');
    }
  }
  assert.equal(mock.calls.length, 0);
});

// The connection dropped (client gone or a server crash): whatever arrived, a stream without its pageInfo did not
// complete. A record cut before its blank line (a pageInfo too) and a 2xx body that is not an event stream are such.
test('a stream that ends before pageInfo is a network failure after the events it sent', async () => {
  const chunk = 'event: chunk\ndata: {"frontier":600,"found":1,"finalized":1,"results":[]}\n\n';
  const cases: [Response, string[]][] = [
    [streamResponse([chunk]), ['result', 'failure']],
    [streamResponse([]), ['failure']],
    [streamResponse([chunk], new TypeError('terminated')), ['result', 'failure']],
    [streamResponse(['event: chunk\ndata: {"frontier":600,"found":1,"fin']), ['failure']],
    [streamResponse([chunk, 'event: pageInfo\ndata: {"startCursor":"s","endCu']), ['result', 'failure']],
    [streamResponse([chunk, PAGE_INFO_FRAME.trimEnd()]), ['result', 'failure']],
    [new Response(JSON.stringify({ itineraries: [] }), { status: 200, headers: { 'content-type': 'application/json' } }), ['failure']],
  ];
  for (const [response, types] of cases) {
    const client = new SpiderClient('https://x', 'k', { fetch: (async () => response) as FetchLike });

    const events = await collect(client.routing.planStream(STREAM_OPTIONS));

    assert.deepEqual(events.map((e) => e.type), types);
    const last = events[events.length - 1];
    assert.equal(last.type === 'failure' && last.error.code, 'network');
  }
});

test('a stream cut after its pageInfo ends with that done, not a failure', async () => {
  for (const response of [streamResponse([PAGE_INFO_FRAME], new TypeError('terminated')), streamResponse([PAGE_INFO_FRAME])]) {
    const client = new SpiderClient('https://x', 'k', { fetch: (async () => response) as FetchLike });

    const events = await collect(client.routing.planStream(STREAM_OPTIONS));

    assert.deepEqual(events.map((e) => e.type), ['done']);
  }
});

test('a malformed frame ends the stream with that decoding failure', async () => {
  const mock = sseFetch(['event: chunk\ndata: {not json\n\n', PAGE_INFO_FRAME, DONE_FRAME]);
  const client = new SpiderClient('https://x', 'k', { fetch: mock.fetch });

  const events = await collect(client.routing.planStream(STREAM_OPTIONS));

  assert.deepEqual(events.map((e) => e.type), ['failure']);
  assert.equal(events[0].type === 'failure' && events[0].error.code, 'decoding');
});

test('planStream surfaces a 400 sent before the stream as bad_request naming the field', async () => {
  const fetch: FetchLike = async () => new Response(
    JSON.stringify({ code: 'bad_request', message: 'targetResults is out of range', field: 'targetResults' }),
    { status: 400, headers: { 'content-type': 'application/json' } },
  );
  const client = new SpiderClient('https://x', 'k', { fetch });

  const events = await collect(client.routing.planStream({ ...STREAM_OPTIONS, targetResults: 500 }));

  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.type, 'failure');
  if (ev.type === 'failure') {
    assert.equal(ev.error.code, 'bad_request');
    assert.equal(ev.error.httpStatus, 400);
    assert.equal(ev.error.field, 'targetResults');
    assert.equal(ev.error.message, 'POST /routing/v1/plan-stream -> 400: targetResults is out of range');
  }
});

test('planStream surfaces a plan-limit 403 before the stream starts as a single failure with its code', async () => {
  for (const [code, message] of [
    ['planning_limit_reached', 'trip planning limit reached'],
    ['agreement_inactive', 'agreement is not active'],
  ] as const) {
    const fetch: FetchLike = async () =>
      new Response(JSON.stringify({ error: code, message }), { status: 403, headers: { 'content-type': 'application/json' } });
    const client = new SpiderClient('https://x', 'k', { fetch });

    for (const stream of [
      client.routing.planStream(STREAM_OPTIONS),
      client.routing.planStreamNext(STREAM_OPTIONS, 'cursor'),
    ]) {
      const events = await collect(stream);

      assert.equal(events.length, 1);
      const ev = events[0];
      assert.equal(ev.type, 'failure');
      if (ev.type === 'failure') {
        assert.equal(ev.error.code, code);
        assert.equal(ev.error.httpStatus, 403);
        assert.equal(ev.error.serverCode, code);
        assert.equal(ev.error.message, message);
      }
    }
  }
});

test('planStream surfaces a non-2xx response as a single failure event', async () => {
  const fetch: FetchLike = async () => new Response('forbidden', { status: 403 });
  const client = new SpiderClient('https://x', 'k', { fetch });

  const events = await collect(client.routing.planStream(STREAM_OPTIONS));

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'failure');
  if (events[0].type !== 'failure') return;
  assert.equal(events[0].error.code, 'unauthorized');
  assert.equal(events[0].error.httpStatus, 403);
});

async function collect(stream: AsyncGenerator<PlanStreamEvent>): Promise<PlanStreamEvent[]> {
  const events: PlanStreamEvent[] = [];
  for await (const ev of stream) events.push(ev);
  return events;
}

// A 200 event stream that delivers `frames` and then closes, or fails with `cut` as a dropped connection does.
function streamResponse(frames: readonly string[], cut?: Error): Response {
  const encoder = new TextEncoder();
  let next = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < frames.length) controller.enqueue(encoder.encode(frames[next++]));
      else if (cut != null) controller.error(cut);
      else controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function sseFetch(frames: readonly string[]): { fetch: FetchLike; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return streamResponse(frames);
  };
  return { fetch: fetch as FetchLike, calls };
}
