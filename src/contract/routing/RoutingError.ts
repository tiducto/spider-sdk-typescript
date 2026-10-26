import type { InputField } from './InputField.ts';
import type { RoutingErrorCode } from './RoutingErrorCode.ts';

/** Why the router declined the plan or found no transit route. `LOCATION_NOT_FOUND`: a stop id resolves to no stop or station (`inputField` `FROM`, `TO` or `VIA`), or a coordinate has no street near enough to link to (`FROM` or `TO`). `OUTSIDE_BOUNDS`: a coordinate lies outside the area the router covers (`FROM` or `TO`). `NO_STOPS_IN_RANGE`: no stop is in walking range of the origin (`FROM`) or the destination (`TO`). `NO_TRANSIT_CONNECTION`: the origin and the destination lie in parts of the transit network that no trip connects (`inputField` null). `WALKING_BETTER_THAN_TRANSIT`: the origin and destination are the same stop, a station and one of its own platforms, identical coordinates or coordinates that snap to the same street point, or every transit itinerary the search found was dropped as worse than walking (`inputField` null). `NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW`: the transit search ran but found no transit itinerary leaving inside the search window (`DATE_TIME`). `NO_DIRECT_MODE_CONNECTION`: a direct-only plan (`modes.directOnly`) found no walk (`inputField` null). `OUTSIDE_SERVICE_PERIOD`: the date is outside what the feed covers (`DATE_TIME`). New codes may be added. */
export interface RoutingError {
  code: RoutingErrorCode;
  description: string;
  /** The request member at fault; null when it is none in particular. */
  inputField: InputField | null;
}
