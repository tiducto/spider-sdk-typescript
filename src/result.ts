import type { SpiderError } from './errors.ts';

export type SpiderResult<T> =
  | { readonly isSuccess: true; readonly data: T; readonly error?: undefined }
  | { readonly isSuccess: false; readonly error: SpiderError; readonly data?: undefined };

export function success<T>(data: T): SpiderResult<T> {
  return { isSuccess: true, data };
}

export function failure<T = never>(error: SpiderError): SpiderResult<T> {
  return { isSuccess: false, error };
}
