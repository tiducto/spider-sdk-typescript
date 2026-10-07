import test from 'node:test';
import assert from 'node:assert/strict';
import { DecodingError, TransportError, toSpiderError, parseErrorEnvelope, httpFailure } from '../src/errors.ts';

test('maps HTTP statuses to error codes', () => {
  assert.equal(toSpiderError(new TransportError('http', 'x', 400)).code, 'bad_request');
  assert.equal(toSpiderError(new TransportError('http', 'x', 401)).code, 'unauthorized');
  assert.equal(toSpiderError(new TransportError('http', 'x', 403)).code, 'unauthorized');
  assert.equal(toSpiderError(new TransportError('http', 'x', 404)).code, 'not_found');
  assert.equal(toSpiderError(new TransportError('http', 'x', 408)).code, 'timeout');
  assert.equal(toSpiderError(new TransportError('http', 'x', 410)).code, 'unknown');
  assert.equal(toSpiderError(new TransportError('http', 'x', 429)).code, 'rate_limited');
  assert.equal(toSpiderError(new TransportError('http', 'x', 503)).code, 'server');
  assert.equal(toSpiderError(new TransportError('http', 'x', 418)).code, 'unknown');
});

test('carries the HTTP status through', () => {
  assert.equal(toSpiderError(new TransportError('http', 'x', 503)).httpStatus, 503);
});

test('maps transport kinds, decoding and network', () => {
  assert.equal(toSpiderError(new TransportError('no_data', 'x')).code, 'not_found');
  assert.equal(toSpiderError(new TransportError('upstream', 'x')).code, 'server');
  assert.equal(toSpiderError(new DecodingError('x')).code, 'decoding');
  assert.equal(toSpiderError(new TypeError('fetch failed')).code, 'network');
  assert.equal(toSpiderError('weird').code, 'unknown');
});

test('surfaces the server error code from the envelope', () => {
  const err = toSpiderError(new TransportError('http', 'POST /x -> 429: Rate limit exceeded.', 429, 'rate_limited'));
  assert.equal(err.code, 'rate_limited');
  assert.equal(err.serverCode, 'rate_limited');
});

test('parseErrorEnvelope extracts code, message and field, tolerates non-JSON', () => {
  assert.deepEqual(parseErrorEnvelope('{"code":"forbidden","message":"nope"}'), { code: 'forbidden', message: 'nope', field: undefined });
  assert.deepEqual(parseErrorEnvelope('plain text'), {});
  assert.deepEqual(parseErrorEnvelope('{"message":"only msg"}'), { code: undefined, message: 'only msg', field: undefined });
  assert.deepEqual(
    parseErrorEnvelope('{"code":"bad_request","message":"via is invalid","field":"via"}'),
    { code: 'bad_request', message: 'via is invalid', field: 'via' },
  );
});

test('parseErrorEnvelope takes a code-shaped gateway `error` as the code, but not a sentence', () => {
  assert.deepEqual(
    parseErrorEnvelope('{"error":"planning_limit_reached","message":"trip planning limit reached"}'),
    { code: 'planning_limit_reached', message: 'trip planning limit reached', field: undefined },
  );
  assert.deepEqual(
    parseErrorEnvelope('{"error":"Access to this API has been disallowed"}'),
    { code: undefined, message: undefined, field: undefined },
  );
});

for (const [code, message] of [
  ['planning_limit_reached', 'trip planning limit reached'],
  ['agreement_inactive', 'agreement is not active'],
] as const) {
  test(`a 403 ${code} body is ${code} with the body message`, () => {
    const err = toSpiderError(httpFailure('routing plan', 403, JSON.stringify({ error: code, message })));
    assert.equal(err.code, code);
    assert.equal(err.httpStatus, 403);
    assert.equal(err.serverCode, code);
    assert.equal(err.message, message);
  });

  test(`the ${code} body code wins over a rewritten status`, () => {
    for (const status of [400, 401, 404, 429, 500, 502]) {
      const err = toSpiderError(httpFailure('GET /realtime/v1/alerts', status, JSON.stringify({ error: code, message })));
      assert.equal(err.code, code, `status ${status}`);
      assert.equal(err.httpStatus, status);
      assert.equal(err.message, message);
    }
  });
}

test('a plan-limit error takes the body message, and the fixed wording only when the body has none', () => {
  const custom = toSpiderError(httpFailure('routing plan', 403, '{"error":"planning_limit_reached","message":"trial planning used up"}'));
  assert.equal(custom.code, 'planning_limit_reached');
  assert.equal(custom.message, 'trial planning used up');
  const inactive = toSpiderError(httpFailure('GET /realtime/v1/alerts', 403, '{"error":"agreement_inactive","message":"agreement expired"}'));
  assert.equal(inactive.code, 'agreement_inactive');
  assert.equal(inactive.message, 'agreement expired');
  assert.equal(toSpiderError(httpFailure('routing plan', 403, '{"error":"planning_limit_reached"}')).message, 'trip planning limit reached');
  assert.equal(toSpiderError(httpFailure('routing plan', 403, '{"error":"agreement_inactive","message":""}')).message, 'agreement is not active');
});

test('a plan-limit code is the body `code`, else its `error`', () => {
  const codeOnly = toSpiderError(httpFailure('routing plan', 403, '{"code":"agreement_inactive"}'));
  assert.equal(codeOnly.code, 'agreement_inactive');
  assert.equal(codeOnly.serverCode, 'agreement_inactive');
  assert.equal(codeOnly.message, 'agreement is not active');
  const both = toSpiderError(httpFailure('routing plan', 403, '{"code":"planning_limit_reached","error":"planning_limit_reached","message":"trial planning used up"}'));
  assert.equal(both.code, 'planning_limit_reached');
  assert.equal(both.message, 'trial planning used up');
  const codeWins = toSpiderError(httpFailure('routing plan', 403, '{"error":"agreement_inactive","code":"x"}'));
  assert.equal(codeWins.code, 'unauthorized');
  assert.equal(codeWins.httpStatus, 403);
  assert.equal(codeWins.serverCode, 'x');
});

test('a 403 without a plan-limit code stays unauthorized', () => {
  for (const text of ['', 'Forbidden', '{"message":"Access denied"}', '{"error":"Access to this API has been disallowed"}']) {
    const err = toSpiderError(httpFailure('routing plan', 403, text));
    assert.equal(err.code, 'unauthorized', JSON.stringify(text));
    assert.equal(err.httpStatus, 403);
    assert.equal(err.serverCode, undefined);
  }
});

test('a 400 naming a field is bad_request with that field, from a JSON envelope or plain text', () => {
  const stops = toSpiderError(httpFailure('POST /stops/v1/search', 400, '{"error":"bad_request","message":"limit is out of range"}'));
  assert.equal(stops.code, 'bad_request');
  assert.equal(stops.field, 'limit');
  const realtime = toSpiderError(httpFailure('GET /realtime/v1/vehicles', 400, 'tripIds is out of range\n'));
  assert.equal(realtime.code, 'bad_request');
  assert.equal(realtime.field, 'tripIds');
  assert.equal(realtime.message, 'GET /realtime/v1/vehicles -> 400: tripIds is out of range');
  const search = toSpiderError(httpFailure('POST /stops/v1/search', 400, '{"message":"Attribute `name` is not filterable."}'));
  assert.equal(search.code, 'bad_request');
  assert.equal(search.field, undefined);
  assert.equal(toSpiderError(httpFailure('POST /stops/v1/search', 400, '{"message":"hitsPerPage is not allowed"}')).field, 'hitsPerPage');
  assert.equal(toSpiderError(httpFailure('POST /stops/v1/search', 400, '{"message":"limit is invalid"}')).field, 'limit');
  assert.equal(toSpiderError(httpFailure('GET /x', 404, 'limit is out of range')).field, undefined);
});

test('a 400 field is the body `field`, else the dot path its message names', () => {
  const named = toSpiderError(httpFailure('POST /routing/v1/plan', 400, '{"code":"bad_request","message":"dateTime is invalid","field":"dateTime"}'));
  assert.equal(named.code, 'bad_request');
  assert.equal(named.field, 'dateTime');
  const bodyWins = toSpiderError(httpFailure('POST /routing/v1/plan', 400, '{"code":"bad_request","message":"something else","field":"via"}'));
  assert.equal(bodyWins.field, 'via');
  for (const [message, field] of [
    ['preferences.transit.transfer.maximumTransfers is out of range', 'preferences.transit.transfer.maximumTransfers'],
    ['preferences.street.bicycle is not allowed', 'preferences.street.bicycle'],
    ['targetResults is required', 'targetResults'],
    ['via.visit.coordinate is not allowed', 'via.visit.coordinate'],
  ] as const) {
    assert.equal(toSpiderError(httpFailure('POST /routing/v1/plan', 400, JSON.stringify({ code: 'bad_request', message }))).field, field, message);
  }
  assert.equal(toSpiderError(httpFailure('POST /routing/v1/plan', 400, '{"message":"the via list is invalid"}')).field, undefined);
  assert.equal(toSpiderError(httpFailure('POST /routing/v1/plan', 403, '{"message":"x","field":"via"}')).field, undefined);
});
