interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

type Query = Record<string, string | undefined>;

export interface ApiResult {
  status: number;
  body: string;
}

type MiaMoreErrorType = 'http_error' | 'invalid_response';

export class MiaMoreError extends Error {
  readonly type: MiaMoreErrorType;
  readonly status?: number;
  readonly body?: string;

  constructor(type: MiaMoreErrorType, status?: number, body?: string) {
    super(
      type === 'http_error'
        ? `MiaMore backend returned HTTP ${status}${body ? `: ${body}` : ''}`
        : 'The server returned a response that could not be understood.',
    );

    this.name = 'MiaMoreError';
    this.type = type;
    this.status = status;
    this.body = body;
  }
}

const buildUrl = (baseUrl: string, path: string, query?: Query) => {
  const url = new URL(path.replace(/^\/+/, ''), `${baseUrl}/`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  return url.toString();
};

const execute = async (url: string, init: RequestInit) => {
  const res = await fetch(url, init);
  const body = await res.text();

  return { status: res.status, body };
};

export const get = (config: ApiConfig, path: string, query?: Query) =>
  execute(buildUrl(config.baseUrl, path, query), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: 'application/json',
    },
  });

export const post = (config: ApiConfig, path: string, body: Record<string, unknown>) =>
  execute(buildUrl(config.baseUrl, path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

export const throwIfError = (result: ApiResult) => {
  if (result.status >= 300) {
    throw new MiaMoreError('http_error', result.status, result.body || undefined);
  }
};

export const parseJson = (result: ApiResult) => {
  try {
    return JSON.parse(result.body);
  } catch {
    throw new MiaMoreError('invalid_response');
  }
};
