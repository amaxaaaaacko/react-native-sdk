import type { Configuration, SDKError } from './MiaMoreSDK';

/** Mirrors HTTP.swift / MiaMoreHttp.kt: URL building and a small request/response helper shared by every endpoint wrapper. */

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(path.replace(/^\/+/, ''), `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export interface HttpResult {
  status: number;
  body: string;
}

async function execute(url: string, init: RequestInit): Promise<HttpResult> {
  const res = await fetch(url, init);
  const body = await res.text();
  return { status: res.status, body };
}

export async function get(cfg: Configuration, path: string, query?: Record<string, string | undefined>): Promise<HttpResult> {
  const url = buildUrl(cfg.baseUrl, path, query);
  return execute(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      Accept: 'application/json',
    },
  });
}

export async function post(cfg: Configuration, path: string, body: Record<string, unknown>): Promise<HttpResult> {
  const url = buildUrl(cfg.baseUrl, path);
  return execute(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export function throwIfError(result: HttpResult): void {
  if (result.status >= 300) {
    throw { type: 'http_error', status: result.status, body: result.body || null } satisfies SDKError;
  }
}

export function parseJson(result: HttpResult): any {
  try {
    return JSON.parse(result.body);
  } catch {
    throw { type: 'invalid_response' } satisfies SDKError;
  }
}
