/** Error body: a stable machine-readable `code`, which names a state, and a human-readable `message`. */
export interface ErrorResponse {
  /** One of `bad_request`, `key_missing`, `key_invalid`, `key_not_allowed`, `agreement_inactive`, `planning_limit_reached`, `not_found`, `method_not_allowed`, `length_required`, `payload_too_large`, `rate_limited`, `internal_error`, `upstream_unavailable`, `upstream_timeout`. New codes may be added. */
  code: string;
  /** For `bad_request`: `<field> is required|invalid|out of range|not allowed`, or `body is invalid` when the body is empty, not JSON or not an object. */
  message: string;
  /** Present only on a 400 that names one member: its dot path from the body root, array positions omitted, or the query parameter's name. */
  field?: string;
}
