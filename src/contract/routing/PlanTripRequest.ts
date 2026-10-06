import type { PlanDateTimeInput } from './PlanDateTimeInput.ts';
import type { PlanLabeledLocationInput } from './PlanLabeledLocationInput.ts';
import type { PlanModesInput } from './PlanModesInput.ts';
import type { PlanPreferencesInput } from './PlanPreferencesInput.ts';
import type { PlanViaLocationInput } from './PlanViaLocationInput.ts';
import type { Reliability } from './Reliability.ts';

/** POST body for `/routing/plan`: one page of itineraries. Paging: `before` and `after` are exclusive. Use `first` with `after` or with no cursor, and `last` only with `before`. The next page is the same body plus `after` (the page's `pageInfo.endCursor`), sized by `first`. The previous page is the same body without `first` and `after`, plus `before` (`pageInfo.startCursor`), sized by `last`. Any other pairing is a 400 naming the member that breaks it. A key not listed here, at any depth, is a 400 `<path> is not allowed`. Every bound is rejected, never clamped. `null` on an optional member means absent. */
export interface PlanTripRequest {
  dateTime: PlanDateTimeInput;
  /** Where the journey starts. An unknown stop id is a 200 with the `routingErrors` code `LOCATION_NOT_FOUND` on `FROM`. */
  origin: PlanLabeledLocationInput;
  /** Where the journey ends. An unknown stop id is a 200 with the `routingErrors` code `LOCATION_NOT_FOUND` on `TO`. */
  destination: PlanLabeledLocationInput;
  /** Locations the journey must visit or pass through, in the order given. How many a request takes is an environment setting, and an environment set to 0 has via turned off; more is a 400 naming `via`. An unknown via stop id is a 200 with the `routingErrors` code `LOCATION_NOT_FOUND` on `VIA`. */
  via?: PlanViaLocationInput[];
  modes?: PlanModesInput;
  preferences?: PlanPreferencesInput;
  /** How much time after `dateTime` the search covers (before it, for `latestArrival`), as an ISO-8601 duration such as `PT2H`: above zero and at most the environment's search-window limit; rejected, never clamped. */
  searchWindow: string;
  /** Itineraries on this page: 1 up to the environment's itinerary limit; rejected, never clamped. Absent means the limit. With `after` or no cursor, never with `before`. */
  first?: number;
  /** Itineraries on the previous page: 1 up to the environment's itinerary limit; rejected, never clamped. Absent means the limit. Only with `before`. */
  last?: number;
  /** `pageInfo.startCursor` of a page, to fetch the page before it. Never with `after`. */
  before?: string;
  /** `pageInfo.endCursor` of a page, to fetch the page after it. Never with `before`. */
  after?: string;
  /** Delay-aware planning level; omitted or null plans on the timetable alone. */
  reliability?: Reliability;
}
