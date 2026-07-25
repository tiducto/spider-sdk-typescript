export type SpiderErrorCode =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'not_found'
  | 'server'
  | 'rate_limited'
  | 'decoding'
  | 'unknown';

export interface SpiderError {
  readonly code: SpiderErrorCode;
  readonly message: string;
  readonly httpStatus?: number;
  readonly cause?: unknown;
}

export class SpiderContractMismatchError extends Error {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(`Spider contract mismatch: this SDK speaks ${expected} but the gateway declared ${actual}`);
    this.name = 'SpiderContractMismatchError';
    this.expected = expected;
    this.actual = actual;
  }
}

export type TransportErrorKind = 'http' | 'no_data' | 'upstream';

export class TransportError extends Error {
  readonly kind: TransportErrorKind;
  readonly httpStatus: number | undefined;

  constructor(kind: TransportErrorKind, message: string, httpStatus?: number) {
    super(message);
    this.name = 'TransportError';
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
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
      if (status === 401 || status === 403) return { code: 'unauthorized', message: e.message, httpStatus: status };
      if (status === 404) return { code: 'not_found', message: e.message, httpStatus: status };
      if (status === 408 || status === 504) return { code: 'timeout', message: e.message, httpStatus: status };
      if (status === 429) return { code: 'rate_limited', message: e.message, httpStatus: status };
      if (status >= 500 && status <= 599) return { code: 'server', message: e.message, httpStatus: status };
      return { code: 'unknown', message: e.message, httpStatus: status };
    }
    if (e.kind === 'no_data') return { code: 'not_found', message: e.message };
    return { code: 'server', message: e.message };
  }
  if (e instanceof DecodingError) return { code: 'decoding', message: e.message, cause: e.cause };
  if (isAbort(e)) return { code: 'timeout', message: messageOf(e), cause: e };
  if (e instanceof TypeError) return { code: 'network', message: messageOf(e), cause: e };
  return { code: 'unknown', message: messageOf(e), cause: e };
}
