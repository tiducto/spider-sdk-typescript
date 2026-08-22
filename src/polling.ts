import type { SpiderRealtime, VehiclePositions, LiveVehicleUpdate, TripDelays, ServiceAlerts } from './realtime.ts';
import type { SpiderResult } from './result.ts';

export interface PollOptions {
  readonly intervalMs?: number;
  readonly signal?: AbortSignal;
}

export function pollVehicles(
  realtime: SpiderRealtime,
  tripIds: readonly string[],
  options?: PollOptions,
): AsyncGenerator<SpiderResult<VehiclePositions>> {
  return poll(options, () => realtime.vehicles(tripIds));
}

export function pollVehicleForTrip(
  realtime: SpiderRealtime,
  tripId: string,
  options?: PollOptions,
): AsyncGenerator<SpiderResult<LiveVehicleUpdate>> {
  return poll(options, () => realtime.vehicleForTrip(tripId));
}

export function pollDelays(
  realtime: SpiderRealtime,
  tripIds: readonly string[],
  options?: PollOptions,
): AsyncGenerator<SpiderResult<TripDelays>> {
  return poll(options, () => realtime.delays(tripIds));
}

export function pollAlerts(
  realtime: SpiderRealtime,
  options?: PollOptions,
): AsyncGenerator<SpiderResult<ServiceAlerts>> {
  return poll(options, () => realtime.alerts());
}

async function* poll<T>(
  options: PollOptions | undefined,
  fetch: () => Promise<SpiderResult<T>>,
): AsyncGenerator<SpiderResult<T>> {
  const intervalMs = options?.intervalMs ?? 15_000;
  const signal = options?.signal;
  let lastKey: string | undefined;
  while (!signal?.aborted) {
    const result = await fetch();
    const key = result.isSuccess
      ? `ok:${JSON.stringify(result.data)}`
      : `err:${result.error.code}:${result.error.message ?? ''}`;
    if (key !== lastKey) {
      lastKey = key;
      yield result;
    }
    if (signal?.aborted) break;
    await sleep(intervalMs, signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}
