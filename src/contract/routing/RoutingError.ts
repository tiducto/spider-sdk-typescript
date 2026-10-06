import type { InputField } from './InputField.ts';
import type { RoutingErrorCode } from './RoutingErrorCode.ts';

/** Why the router declined the plan: `LOCATION_NOT_FOUND` for an unknown stop id (`inputField` `FROM`, `TO` or `VIA`), `WALKING_BETTER_THAN_TRANSIT` when the origin and destination are close enough that walking beats transit (`inputField` null), or `OUTSIDE_SERVICE_PERIOD` for a date the feed does not cover (`DATE_TIME`). New codes may be added. */
export interface RoutingError {
  code: RoutingErrorCode;
  description: string;
  /** The request member at fault; null when it is none in particular. */
  inputField?: InputField;
}
