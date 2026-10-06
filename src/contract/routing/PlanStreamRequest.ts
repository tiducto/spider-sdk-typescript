import type { PlanDateTimeInput } from './PlanDateTimeInput.ts';
import type { PlanLabeledLocationInput } from './PlanLabeledLocationInput.ts';
import type { PlanModesInput } from './PlanModesInput.ts';
import type { PlanPreferencesInput } from './PlanPreferencesInput.ts';
import type { PlanViaLocationInput } from './PlanViaLocationInput.ts';
import type { Reliability } from './Reliability.ts';

/** POST body for `/routing/v1/plan-stream`: the Plan Trip search, streamed. Instead of a fixed window, the stream widens its search until it has sent `targetResults` itineraries or has searched `maxWindow`. To continue, send the `pageInfo` event's `endCursor` as `after` (later) or its `startCursor` as `before` (earlier); `before` and `after` are exclusive. A key not listed here, at any depth, is a 400 `<path> is not allowed`. Every bound is rejected, never clamped. `null` on an optional member means absent. */
export interface PlanStreamRequest {
  dateTime: PlanDateTimeInput;
  /** Where the journey starts. An unknown stop id is a 200 with the `routingErrors` code `LOCATION_NOT_FOUND` on `FROM`. */
  origin: PlanLabeledLocationInput;
  /** Where the journey ends. An unknown stop id is a 200 with the `routingErrors` code `LOCATION_NOT_FOUND` on `TO`. */
  destination: PlanLabeledLocationInput;
  /** Locations the journey must visit or pass through, in the order given. How many a request takes is an environment setting, and an environment set to 0 has via turned off; more is a 400 naming `via`. An unknown via stop id is a 200 with the `routingErrors` code `LOCATION_NOT_FOUND` on `VIA`. */
  via?: PlanViaLocationInput[];
  modes?: PlanModesInput;
  preferences?: PlanPreferencesInput;
  /** The stream stops once it has sent this many itineraries: 1 up to the environment's itinerary limit; rejected, never clamped. */
  targetResults: number;
  /** The stream stops once it has searched this far past `dateTime` (before it, for `latestArrival`), as an ISO-8601 duration: at least `PT2H` and at most the environment's search-window limit; rejected, never clamped. */
  maxWindow: string;
  /** `pageInfo.startCursor` of a page, to fetch the page before it. Never with `after`. */
  before?: string;
  /** `pageInfo.endCursor` of a page, to fetch the page after it. Never with `before`. */
  after?: string;
  /** Delay-aware planning level; omitted or null plans on the timetable alone. */
  reliability?: Reliability;
}
