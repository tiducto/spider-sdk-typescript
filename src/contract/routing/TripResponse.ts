import type { TripTimetable } from './TripTimetable.ts';

/** `trip` is null for an id that resolves to no trip. */
export interface TripResponse {
  trip: TripTimetable | null;
}
