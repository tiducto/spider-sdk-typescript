import type { TripTimetable } from './TripTimetable.ts';

/** `trip` is null for an unknown id. */
export interface TripResponse {
  trip?: TripTimetable;
}
