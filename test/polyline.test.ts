import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline } from '../src/polyline.ts';

test('decodes the canonical Google polyline example at precision 6', () => {
  const points = decodePolyline('_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI');
  assert.equal(points.length, 3);
  assert.ok(Math.abs(points[0].lat - 38.5) < 1e-6);
  assert.ok(Math.abs(points[0].lon - -120.2) < 1e-6);
  assert.ok(Math.abs(points[2].lat - 43.252) < 1e-6);
  assert.ok(Math.abs(points[2].lon - -126.453) < 1e-6);
});

test('empty input yields no points', () => {
  assert.deepEqual(decodePolyline(''), []);
});
