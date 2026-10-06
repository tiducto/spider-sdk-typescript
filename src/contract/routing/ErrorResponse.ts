/** Error body: a stable machine-readable `code` (a state name) and a human-readable `message`. */
export interface ErrorResponse {
  code?: string;
  /** For bad_request: `<field> is required|invalid|out of range|not allowed`. */
  message: string;
  /** The request member a 400 names, as a dot path from the body root (array positions omitted). */
  field?: string;
}
