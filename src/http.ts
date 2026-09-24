import { CONTRACT_HEADER, CONTRACT_VERSION, checkContract } from './contract.ts';
import { SDK_HEADER, SDK_IDENTITY } from './sdk.ts';
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

interface GraphQLError {
  message: string;
  extensions?: { code?: string; field?: string } | null;
}

interface GraphQLEnvelope<D> {
  data?: D | null;
  errors?: ReadonlyArray<GraphQLError> | null;
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
    // Bind the default to the global: calling `this.doFetch(...)` otherwise invokes native fetch
    // with the Transport as receiver, which browsers reject with "Illegal invocation" (Node's
    // fetch is lenient, so this only surfaces in the browser).
    this.doFetch = options?.fetch ?? fetch.bind(globalThis);
    this.timeoutMs = options?.timeoutMs ?? 30_000;
    this.retry = options?.retry;
  }

  async graphql<D>(op: { id: string; path: string }, variables: unknown): Promise<D> {
    const res = await this.send(`${this.baseUrl}/routing/${op.path}`, {
      method: 'POST',
      headers: this.contractHeaders({ 'content-type': 'application/json' }),
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
      // A BAD_REQUEST extension → typed bad_request; anything else stays a generic upstream (→ server).
      const bad = envelope.errors.find((e) => e.extensions?.code === 'BAD_REQUEST');
      if (bad != null) {
        throw new TransportError('bad_request', bad.message, undefined, undefined, bad.extensions?.field);
      }
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
      headers: this.contractHeaders({ 'content-type': 'application/json' }),
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
    const res = await this.send(url.toString(), { method: 'GET', headers: this.contractHeaders() });
    checkContract(res.headers.get(CONTRACT_HEADER));
    return { ok: res.ok, status: res.status, text: await res.text() };
  }

  /**
   * Best-effort connection warm-up. Issues one `GET {baseUrl}/ping`, authenticated with the
   * client apikey, through this transport's own fetch, so the TLS handshake + connection it opens
   * joins the per-origin pool and is reused by the first real call. Returns the measured
   * round-trip in milliseconds.
   *
   * Never rejects: a network error, a timeout, or a non-2xx (e.g. a 401 against a keyless gateway,
   * or a 404 before the `/ping` route is deployed) all still opened — or attempted to open — the
   * connection, so the elapsed time is returned regardless. Only the apikey rides the request — it
   * comes from the transport's shared request setup in `send()`; `/ping` is not contract-gated, so
   * no contract/sdk headers are sent.
   */
  async ping(): Promise<number> {
    const start = performance.now();
    try {
      const res = await this.send(`${this.baseUrl}/ping`, { method: 'GET' });
      // Drain the body so the connection is released back to the pool for the first real call.
      await res.text();
    } catch {
      // Best-effort: the connection attempt itself is the warm-up — swallow every failure.
    }
    return performance.now() - start;
  }

  // Contract-gated calls carry the contract + sdk identity headers; the apikey is applied
  // centrally in `send()`, so it's not set here.
  private contractHeaders(extra?: Record<string, string>): Headers {
    const headers = new Headers(extra);
    headers.set(CONTRACT_HEADER, CONTRACT_VERSION);
    headers.set(SDK_HEADER, SDK_IDENTITY);
    return headers;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    // The client apikey is invariant for the client's whole life, so it's applied here on the
    // shared request path — carried by every request (real calls and the warm-up) rather than
    // re-attached per call.
    const headers = new Headers(init.headers);
    headers.set('apikey', this.apiKey);
    const request: RequestInit = { ...init, headers };
    const maxAttempts = this.retry?.maxAttempts ?? 1;
    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response | undefined;
      let err: unknown;
      try {
        res = await this.doFetch(url, { ...request, signal: controller.signal });
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
