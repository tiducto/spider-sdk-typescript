import { CONTRACT_HEADER, CONTRACT_VERSION, checkContract } from './contract.ts';
import { DecodingError, TransportError } from './errors.ts';

export type FetchLike = typeof fetch;

export interface SpiderClientOptions {
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
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

  constructor(baseUrl: string, apiKey: string, options?: SpiderClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.doFetch = options?.fetch ?? fetch;
    this.timeoutMs = options?.timeoutMs ?? 30_000;
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
      throw new TransportError('http', `routing ${op.path} -> ${res.status}: ${text.slice(0, 300)}`, res.status);
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
      const message = errorMessage ? errorMessage(text) : text.slice(0, 300);
      throw new TransportError('http', `POST ${path} -> ${res.status}: ${message}`, res.status);
    }
    return parseJson<D>(text, `POST ${path}`);
  }

  async getJson<D>(path: string, query?: Record<string, string>): Promise<D> {
    const raw = await this.getRaw(path, query);
    if (!raw.ok) {
      throw new TransportError('http', `GET ${path} -> ${raw.status}: ${raw.text.slice(0, 300)}`, raw.status);
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.doFetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
