import { CONTRACT_HEADER, CONTRACT_VERSION, checkContract } from './contract.ts';
import { DecodingError, TransportError, parseErrorEnvelope } from './errors.ts';

export type FetchLike = typeof fetch;

export interface AutoRetryOptions {
  readonly maxAttempts?: number;
}

export interface FeatureOptions {
  readonly autoRetry?: AutoRetryOptions;
}

export interface SpiderClientOptions {
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  readonly routing?: FeatureOptions;
  readonly stops?: FeatureOptions;
  readonly realtime?: FeatureOptions;
}

export interface TransportOptions {
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  readonly retry?: { readonly maxAttempts: number };
}

export interface RawResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly text: string;
}

interface GraphQLEnvelope<D> {
  data?: D | null;
  errors?: ReadonlyArray<{ message: string }> | null;
}

export function parseJson<T>(text: string, where: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new DecodingError(`failed to decode ${where}`, e);
  }
}

export class Transport {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly doFetch: FetchLike;
  private readonly timeoutMs: number;
  private readonly retry?: { readonly maxAttempts: number };

  constructor(baseUrl: string, apiKey: string, options?: TransportOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.doFetch = options?.fetch ?? fetch;
    this.timeoutMs = options?.timeoutMs ?? 30_000;
    this.retry = options?.retry;
  }

  async graphql<D>(op: { id: string; path: string }, variables: unknown): Promise<D> {
    const res = await this.send(`${this.baseUrl}/routing/${op.path}`, {
      method: 'POST',
      headers: this.buildHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ id: op.id, variables }),
    });
    checkContract(res.headers.get(CONTRACT_HEADER));
    const text = await res.text();
    if (!res.ok) {
      const env = parseErrorEnvelope(text);
      const detail = env.message ?? text.slice(0, 300);
      throw new TransportError('http', `routing ${op.path} -> ${res.status}: ${detail}`, res.status, env.code);
    }
    const envelope = parseJson<GraphQLEnvelope<D>>(text, `routing ${op.path}`);
    if (envelope.errors != null && envelope.errors.length > 0) {
      throw new TransportError('upstream', `routing ${op.path} errors: ${envelope.errors.map((e) => e.message).join(', ')}`);
    }
    if (envelope.data == null) {
      throw new TransportError('no_data', `routing ${op.path} returned no data`);
    }
    return envelope.data;
  }

  async postJson<D>(path: string, body: unknown, errorMessage?: (raw: string) => string): Promise<D> {
    const res = await this.send(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.buildHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    });
    checkContract(res.headers.get(CONTRACT_HEADER));
    const text = await res.text();
    if (!res.ok) {
      const env = parseErrorEnvelope(text);
      const message = errorMessage ? errorMessage(text) : (env.message ?? text.slice(0, 300));
      throw new TransportError('http', `POST ${path} -> ${res.status}: ${message}`, res.status, env.code);
    }
    return parseJson<D>(text, `POST ${path}`);
  }

  async getJson<D>(path: string, query?: Record<string, string>): Promise<D> {
    const raw = await this.getRaw(path, query);
    if (!raw.ok) {
      const env = parseErrorEnvelope(raw.text);
      const detail = env.message ?? raw.text.slice(0, 300);
      throw new TransportError('http', `GET ${path} -> ${raw.status}: ${detail}`, raw.status, env.code);
    }
    return parseJson<D>(raw.text, `GET ${path}`);
  }

  async getRaw(path: string, query?: Record<string, string>): Promise<RawResponse> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    const res = await this.send(url.toString(), { method: 'GET', headers: this.buildHeaders() });
    checkContract(res.headers.get(CONTRACT_HEADER));
    return { ok: res.ok, status: res.status, text: await res.text() };
  }

  private buildHeaders(extra?: Record<string, string>): Headers {
    const headers = new Headers(extra);
    headers.set('apikey', this.apiKey);
    headers.set(CONTRACT_HEADER, CONTRACT_VERSION);
    return headers;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    const maxAttempts = this.retry?.maxAttempts ?? 1;
    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response | undefined;
      let err: unknown;
      try {
        res = await this.doFetch(url, { ...init, signal: controller.signal });
      } catch (e) {
        err = e;
      } finally {
        clearTimeout(timer);
      }
      if (res !== undefined) {
        if (attempt < maxAttempts && (res.status === 429 || res.status >= 500)) {
          await retryDelay(attempt, res);
          continue;
        }
        return res;
      }
      if (attempt < maxAttempts) {
        await retryDelay(attempt, undefined);
        continue;
      }
      throw err;
    }
  }
}

function retryDelay(attempt: number, response?: Response): Promise<void> {
  const header = response?.headers.get('retry-after');
  const retryAfterMs = header != null ? Number(header) * 1000 : Number.NaN;
  const base = Number.isFinite(retryAfterMs) && retryAfterMs >= 0
    ? retryAfterMs
    : Math.min(1000 * 2 ** (attempt - 1), 10_000);
  const jitter = base * 0.25 * Math.random();
  return new Promise((resolve) => setTimeout(resolve, base + jitter));
}
