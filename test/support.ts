import type { FetchLike } from '../src/http.ts';

export interface Captured {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

export interface MockReply {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export interface MockFetch {
  fetch: FetchLike;
  calls: Captured[];
}

export function mockFetch(reply: MockReply | ((req: Captured) => MockReply)): MockFetch {
  const calls: Captured[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const captured: Captured = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    };
    calls.push(captured);
    const r = typeof reply === 'function' ? reply(captured) : reply;
    const status = r.status ?? 200;
    const bodyText = r.text ?? (r.json !== undefined ? JSON.stringify(r.json) : '');
    return new Response(bodyText, { status, headers: r.headers });
  };
  return { fetch: fn as FetchLike, calls };
}
