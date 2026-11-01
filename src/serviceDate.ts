import type { SpiderError } from './errors.ts';
import { badRequest } from './errors.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A `bad_request` when `serviceDate` isn't a real ISO `YYYY-MM-DD` calendar date; otherwise null. */
export function invalidServiceDate(serviceDate: string): SpiderError | null {
  if (ISO_DATE.test(serviceDate)) {
    const ms = Date.parse(`${serviceDate}T00:00:00Z`);
    if (Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === serviceDate) return null;
  }
  return badRequest('serviceDate', 'is invalid');
}
