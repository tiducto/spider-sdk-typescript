import type { SpiderError } from './errors.ts';
import { badRequest } from './errors.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The GTFS service date (ISO `YYYY-MM-DD`) of a router `serviceDay` (epoch seconds of noon minus 12h, local time). */
export function serviceDateOf(serviceDay: number): string {
  // Local noon falls on the service date's UTC calendar day for every offset from UTC-11 to UTC+12, DST days included.
  return new Date((serviceDay + 43_200) * 1000).toISOString().slice(0, 10);
}

/** A `bad_request` when `serviceDate` isn't a real ISO `YYYY-MM-DD` calendar date; otherwise null. */
export function invalidServiceDate(serviceDate: string): SpiderError | null {
  if (ISO_DATE.test(serviceDate)) {
    const ms = Date.parse(`${serviceDate}T00:00:00Z`);
    if (Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === serviceDate) return null;
  }
  return badRequest('serviceDate', 'is invalid');
}
