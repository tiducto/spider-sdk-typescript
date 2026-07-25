import test from 'node:test';
import assert from 'node:assert/strict';
import { pollVehicles } from '../src/index.ts';
import type { SpiderRealtime, VehiclePositions } from '../src/index.ts';
import type { SpiderResult } from '../src/result.ts';
import { success, failure } from '../src/result.ts';

function positions(feedTimestampEpochMs: number): VehiclePositions {
  return { vehicles: [], missing: [], freshness: { feedTimestampEpochMs, staleSeconds: null } };
}

function fakeRealtime(script: ReadonlyArray<SpiderResult<VehiclePositions>>): SpiderRealtime {
  let i = 0;
  return {
    vehicles: async () => script[Math.min(i++, script.length - 1)],
  } as unknown as SpiderRealtime;
}

test('polling collapses consecutive identical snapshots', async () => {
  const a = success(positions(1000));
  const b = success(positions(2000));
  const realtime = fakeRealtime([a, a, b, b, b]);

  const got: SpiderResult<VehiclePositions>[] = [];
  for await (const r of pollVehicles(realtime, ['t1'], { intervalMs: 0 })) {
    got.push(r);
    if (got.length === 2) break;
  }

  assert.equal(got.length, 2);
  assert.deepEqual(got[0], a);
  assert.deepEqual(got[1], b);
});

test('polling emits errors and re-emits recovery', async () => {
  const a = success(positions(1000));
  const err = failure<VehiclePositions>({ code: 'server', message: 'boom' });
  const realtime = fakeRealtime([a, err, a]);

  const got: SpiderResult<VehiclePositions>[] = [];
  for await (const r of pollVehicles(realtime, ['t1'], { intervalMs: 0 })) {
    got.push(r);
    if (got.length === 3) break;
  }

  assert.deepEqual(got.map((r) => r.isSuccess), [true, false, true]);
});

test('an already-aborted signal yields nothing', async () => {
  const realtime = fakeRealtime([success(positions(1000))]);
  const controller = new AbortController();
  controller.abort();

  const got: SpiderResult<VehiclePositions>[] = [];
  for await (const r of pollVehicles(realtime, ['t1'], { intervalMs: 0, signal: controller.signal })) {
    got.push(r);
  }

  assert.equal(got.length, 0);
});
