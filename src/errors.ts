/**
 * What went wrong. `bad_request` is an invalid or missing input, caught by the SDK before sending or
 * rejected by the server; `field` names it. `query_retired` means the API no longer serves the persisted
 * query behind the call (HTTP 410 Gone). `search_limit_reached` means the project has used the trip-planning
 * searches its plan includes; it applies to trip planning only. `agreement_inactive` means the project has no
 * active agreement; it applies to every call made with a client key.
 */
export type SpiderErrorCode =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'bad_request'
  | 'not_found'
  | 'query_retired'
  | 'search_limit_reached'
  | 'agreement_inactive'
  | 'server'
  | 'rate_limited'
  | 'decoding'
  | 'unknown';

export interface SpiderError {
  readonly code: SpiderErrorCode;
  readonly message: string;
  readonly httpStatus?: number;
  /**
   * The server's machine-readable error code, when it sends one: e.g. `persisted_query_rejected` on an
   * `unauthorized` when the environment doesn't recognise the query id, or `query_retired`.
   */
  readonly serverCode?: string;
  /** For a `bad_request`, the input field it names (e.g. `searchWindow`, `maxWindow`, `via`, `limit`). */
  readonly field?: string;
  readonly cause?: unknown;
}

const QUERY_RETIRED = 'query_retired';
// Plan-limit refusals: the body code names the state, and the fixed wording stands in for a body without a message.
const LIMIT_MESSAGES = {
  search_limit_reached: 'search limit reached',
  agreement_inactive: 'agreement is not active',
} as const satisfies Partial<Record<SpiderErrorCode, string>>;
type LimitCode = keyof typeof LIMIT_MESSAGES;

/** A `bad_request` that names only the field, like the server's own validation errors. */
export function badRequest(
  field: string,
  problem: 'is required' | 'is out of range' | 'is invalid' = 'is out of range',
): SpiderError {
  return { code: 'bad_request', message: `${field} ${problem}`, field };
}

export type TransportErrorKind = 'http' | 'no_data' | 'upstream' | 'bad_request';

export class TransportError extends Error {
  readonly kind: TransportErrorKind;
  readonly httpStatus: number | undefined;
  readonly serverCode: string | undefined;
  readonly field: string | undefined;
  /** The response body's own `message`, when it has one. */
  readonly serverMessage: string | undefined;

  constructor(
    kind: TransportErrorKind,
    message: string,
    httpStatus?: number,
    serverCode?: string,
    field?: string,
    serverMessage?: string,
  ) {
    super(message);
    this.name = 'TransportError';
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.serverCode = serverCode;
    this.field = field;
    this.serverMessage = serverMessage;
  }
}

export function parseErrorEnvelope(text: string): { code?: string; message?: string } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    // The gateway's own rejections carry their code in `error` (e.g. "query_retired"); other
    // services put a human sentence there, so only a code-shaped value counts.
    const gatewayCode = typeof b.error === 'string' && /^[a-z][a-z0-9_]*$/.test(b.error) ? b.error : undefined;
    return {
      code: typeof b.code === 'string' ? b.code : gatewayCode,
      message: typeof b.message === 'string' ? b.message : undefined,
    };
  }
  return {};
}

// The fixed wording of the gateway's and services' own 400s, e.g. "limit is out of range".
const FIELD_PROBLEM = /^([A-Za-z_]\w*) (?:is required|is out of range|is invalid)$/;

/** A non-2xx response → an `http` TransportError carrying the body's error code, and for a 400 the field it names. */
export function httpFailure(where: string, status: number, text: string, detail?: string): TransportError {
  const env = parseErrorEnvelope(text);
  const message = (detail ?? env.message ?? text.slice(0, 300)).trim();
  const field = status === 400 ? FIELD_PROBLEM.exec(message)?.[1] : undefined;
  return new TransportError('http', `${where} -> ${status}: ${message}`, status, env.code, field, env.message);
}

/**
 * The plan-limit error an `http` failure's body code names (`search_limit_reached`, `agreement_inactive`),
 * whatever its status, or `undefined` when the body names neither.
 */
export function limitRefusal(e: TransportError): SpiderError | undefined {
  if (e.kind !== 'http' || e.serverCode == null || !Object.hasOwn(LIMIT_MESSAGES, e.serverCode)) return undefined;
  const code = e.serverCode as LimitCode;
  return { code, message: e.serverMessage?.trim() || LIMIT_MESSAGES[code], httpStatus: e.httpStatus, serverCode: code };
}

export class DecodingError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DecodingError';
    this.cause = cause;
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'name' in e &&
    ((e as { name: unknown }).name === 'AbortError' || (e as { name: unknown }).name === 'TimeoutError');
}

export function toSpiderError(e: unknown): SpiderError {
  if (e instanceof TransportError) {
    if (e.kind === 'http') {
      // The body code decides whatever the status, since a proxy may rewrite it; plan limits have no status fallback.
      const refusal = limitRefusal(e);
      if (refusal != null) return refusal;
      const status = e.httpStatus ?? 0;
      if (e.serverCode === QUERY_RETIRED || status === 410) {
        return { code: 'query_retired', message: 'persisted query is retired', httpStatus: status, serverCode: e.serverCode };
      }
      const code: SpiderErrorCode =
        status === 400 ? 'bad_request'
          : status === 401 || status === 403 ? 'unauthorized'
            : status === 404 ? 'not_found'
              : status === 408 || status === 504 ? 'timeout'
                : status === 429 ? 'rate_limited'
                  : status >= 500 && status <= 599 ? 'server'
                    : 'unknown';
      return { code, message: e.message, httpStatus: status, serverCode: e.serverCode, field: e.field };
    }
    if (e.kind === 'no_data') return { code: 'not_found', message: e.message };
    if (e.kind === 'bad_request') return { code: 'bad_request', message: e.message, field: e.field };
    return { code: 'server', message: e.message };
  }
  if (e instanceof DecodingError) return { code: 'decoding', message: e.message, cause: e.cause };
  if (isAbort(e)) return { code: 'timeout', message: messageOf(e), cause: e };
  if (e instanceof TypeError) return { code: 'network', message: messageOf(e), cause: e };
  return { code: 'unknown', message: messageOf(e), cause: e };
}
