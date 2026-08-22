import test from 'node:test';
import assert from 'node:assert/strict';
import { transitModeFromWire } from '../src/enums.ts';

test('transitModeFromWire recognizes the full leg- and route-mode vocabulary', () => {
  for (const mode of ['CABLE_CAR', 'FUNICULAR', 'GONDOLA', 'SNOW_AND_ICE', 'BICYCLE', 'CAR', 'SCOOTER', 'TRANSIT']) {
    assert.equal(transitModeFromWire(mode), mode);
  }
});

test('transitModeFromWire falls back to UNKNOWN for an unrecognized value', () => {
  assert.equal(transitModeFromWire('SOMETHING_NEW'), 'UNKNOWN');
});

test('transitModeFromWire passes null/undefined through as null', () => {
  assert.equal(transitModeFromWire(null), null);
  assert.equal(transitModeFromWire(undefined), null);
});
