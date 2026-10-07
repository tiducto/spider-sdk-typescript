import type { InputField } from './InputField.ts';
import type { RoutingErrorCode } from './RoutingErrorCode.ts';

/** Why the router declined the plan or found no transit route. `LOCATION_NOT_FOUND`: a stop id resolves to no stop or station (`inputField` `FROM`, `TO` or `VIA`). `NO_STOPS_IN_RANGE`: no stop is in walking range of the origin (`FROM`) or the destination (`TO`). `NO_TRANSIT_CONNECTION`: the origin and the destination lie in parts of the transit network that no trip connects (`inputField` null). `WALKING_BETTER_THAN_TRANSIT`: the origin and destination are the same stop, a station and one of its own platforms, or coordinates that snap to the same street point (`inputField` null). `OUTSIDE_SERVICE_PERIOD`: the date is outside what the feed covers (`DATE_TIME`). New codes may be added. */
export interface RoutingError {
  code: RoutingErrorCode;
  description: string;
  /** The request member at fault; null when it is none in particular. */
  inputField: InputField | unknown;
}
