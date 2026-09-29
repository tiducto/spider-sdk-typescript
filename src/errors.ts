export type SpiderErrorCode =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'update_required'
  | 'bad_request'
  | 'not_found'
  | 'server'
  | 'rate_limited'
  | 'decoding'
  | 'unknown';

export interface SpiderError {
  readonly code: SpiderErrorCode;
  readonly message: string;
  readonly httpStatus?: number;
  readonly serverCode?: string;
  /**
   * For a `bad_request` (a server validation failure — over-cap `searchWindow`, malformed `via`, or a
   * missing required field), the offending input field when the server names one. Undefined otherwise.
   */
  readonly field?: string;
  readonly cause?: unknown;
}

const PERSISTED_QUERY_REJECTED = 'persisted_query_rejected';

export type TransportErrorKind = 'http' | 'no_data' | 'upstream' | 'bad_request';

export class TransportError extends Error {
  readonly kind: TransportErrorKind;
  readonly httpStatus: number | undefined;
  readonly serverCode: string | undefined;
  readonly field: string | undefined;

  constructor(kind: TransportErrorKind, message: string, httpStatus?: number, serverCode?: string, field?: string) {
    super(message);
    this.name = 'TransportError';
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.serverCode = serverCode;
    this.field = field;
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
    // The gateway's own rejections carry their code in `error` (e.g. "persisted_query_rejected"); other
    // services put a human sentence there, so only a code-shaped value counts.
    const gatewayCode = typeof b.error === 'string' && /^[a-z][a-z0-9_]*$/.test(b.error) ? b.error : undefined;
    return {
      code: typeof b.code === 'string' ? b.code : gatewayCode,
      message: typeof b.message === 'string' ? b.message : undefined,
    };
  }
  return {};
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
      const status = e.httpStatus ?? 0;
      // The SDK only sends persisted-query ids from its own contract, so the gateway rejecting one means
      // this SDK version's query has been retired.
      if (status === 403 && e.serverCode === PERSISTED_QUERY_REJECTED) {
        return {
          code: 'update_required',
          message: `The API no longer serves this SDK version's request; update the SDK (${e.message})`,
          httpStatus: status,
          serverCode: e.serverCode,
        };
      }
      const code: SpiderErrorCode =
        status === 401 || status === 403 ? 'unauthorized'
          : status === 404 ? 'not_found'
            : status === 408 || status === 504 ? 'timeout'
              : status === 429 ? 'rate_limited'
                : status >= 500 && status <= 599 ? 'server'
                  : 'unknown';
      return { code, message: e.message, httpStatus: status, serverCode: e.serverCode };
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
