import test from 'node:test';
import assert from 'node:assert/strict';
import { DecodingError, TransportError, toSpiderError, parseErrorEnvelope } from '../src/errors.ts';

test('maps HTTP statuses to error codes', () => {
  assert.equal(toSpiderError(new TransportError('http', 'x', 401)).code, 'unauthorized');
  assert.equal(toSpiderError(new TransportError('http', 'x', 403)).code, 'unauthorized');
  assert.equal(toSpiderError(new TransportError('http', 'x', 404)).code, 'not_found');
  assert.equal(toSpiderError(new TransportError('http', 'x', 408)).code, 'timeout');
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

test('parseErrorEnvelope extracts code and message, tolerates non-JSON', () => {
  assert.deepEqual(parseErrorEnvelope('{"code":"forbidden","message":"nope"}'), { code: 'forbidden', message: 'nope' });
  assert.deepEqual(parseErrorEnvelope('plain text'), {});
  assert.deepEqual(parseErrorEnvelope('{"message":"only msg"}'), { code: undefined, message: 'only msg' });
});
