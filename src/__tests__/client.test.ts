import { createMiaMoreClient } from '../client';
import type { MiaMoreConfig } from '../types';

interface Call {
  url: URL;
  init: RequestInit;
}

type Responses = Record<string, [number, unknown] | [number, unknown][]>;

const CONFIG: MiaMoreConfig = {
  baseUrl: 'https://stub.miamore.test/',
  bundleId: 'com.example.app',
  apiKey: 'sdk_key',
  customerUserId: 'device-1',
  accountId: 'acct-1',
};

const stubFetch = (responses: Responses) => {
  const calls: Call[] = [];

  globalThis.fetch = jest.fn(async (input: unknown, init: RequestInit) => {
    const url = new URL(String(input));
    const entry = responses[url.pathname];
    const response = Array.isArray(entry?.[0]) ? (entry as [number, unknown][]).shift() : entry;
    const [status, body] = (response as [number, unknown] | undefined) ?? [404, {}];

    calls.push({ url, init });

    return {
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response;
  }) as unknown as typeof fetch;

  return calls;
};

const bodyOf = (call: Call) => JSON.parse(String(call.init.body));

const headersOf = (call: Call) => call.init.headers as Record<string, string>;

describe('createMiaMoreClient', () => {
  it('trims the base url and defaults the environment to PROD', () => {
    const client = createMiaMoreClient(CONFIG);

    expect(client.config.baseUrl).toBe('https://stub.miamore.test');
    expect(client.config.environment).toBe('PROD');
  });
});

describe('getPaywall', () => {
  it('sends the app, user and placement with the API key', async () => {
    const calls = stubFetch({
      '/v1/sdk/paywall': [
        200,
        {
          app_bundle_id: 'com.example.app',
          customer_user_id: 'device-1',
          placement: 'main',
          paywall: { paywall_id: 'p', name: 'Main', products: [{ product_id: 'yearly' }] },
        },
      ],
    });

    const result = await createMiaMoreClient(CONFIG).getPaywall({ placement: 'main' });

    expect(result.paywall.products[0].productId).toBe('yearly');
    expect(calls[0].url.origin).toBe('https://stub.miamore.test');
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({
      bundleId: 'com.example.app',
      customerUserId: 'device-1',
      placement: 'main',
    });
    expect(headersOf(calls[0]).Authorization).toBe('Bearer sdk_key');
  });
});

describe('getSubscriptionStatus', () => {
  it('asks for the configured user by default', async () => {
    const calls = stubFetch({
      '/v1/sdk/subscriptionStatus': [200, { is_active: true, environment: 'PROD' }],
    });

    const status = await createMiaMoreClient(CONFIG).getSubscriptionStatus();

    expect(status.isActive).toBe(true);
    expect(calls[0].url.searchParams.get('customerUserId')).toBe('device-1');
  });

  it('asks for another user when given one', async () => {
    const calls = stubFetch({
      '/v1/sdk/subscriptionStatus': [200, { is_active: true, customer_email: 'buyer@example.com' }],
    });

    const status = await createMiaMoreClient(CONFIG).getSubscriptionStatus({
      customerUserId: 'ctm_1',
    });

    expect(status.customerEmail).toBe('buyer@example.com');
    expect(calls[0].url.searchParams.get('customerUserId')).toBe('ctm_1');
  });

  it('returns an inactive status in the configured environment when the user is not linked', async () => {
    stubFetch({ '/v1/sdk/subscriptionStatus': [404, { error: 'not_linked' }] });

    const status = await createMiaMoreClient({
      ...CONFIG,
      environment: 'SANDBOX',
    }).getSubscriptionStatus();

    expect(status).toMatchObject({ isActive: false, environment: 'SANDBOX' });
  });

  it('throws an http error for other failures', async () => {
    stubFetch({ '/v1/sdk/subscriptionStatus': [404, { error: 'unknown_app' }] });

    const client = createMiaMoreClient(CONFIG);

    await expect(client.getSubscriptionStatus()).rejects.toMatchObject({
      type: 'http_error',
      status: 404,
    });

    stubFetch({ '/v1/sdk/subscriptionStatus': [500, 'oops'] });

    await expect(client.getSubscriptionStatus()).rejects.toMatchObject({
      type: 'http_error',
      status: 500,
      body: 'oops',
      message: 'MiaMore backend returned HTTP 500: oops',
    });
  });

  it('throws an invalid response error for a body that is not JSON', async () => {
    stubFetch({ '/v1/sdk/subscriptionStatus': [200, 'not json'] });

    await expect(createMiaMoreClient(CONFIG).getSubscriptionStatus()).rejects.toMatchObject({
      type: 'invalid_response',
    });
  });
});

describe('link', () => {
  it('links an App Store purchase with the account id as appAccountToken', async () => {
    const calls = stubFetch({ '/v1/sdk/link': [200, { ok: true }] });

    await createMiaMoreClient(CONFIG).link({ kind: 'apple', originalTransactionId: '123' });

    expect(bodyOf(calls[0])).toEqual({
      bundleId: 'com.example.app',
      customerUserId: 'device-1',
      appAccountToken: 'acct-1',
      environment: 'PROD',
      originalTransactionId: '123',
    });
  });

  it('links a Google Play purchase with the account id as obfuscatedAccountId', async () => {
    const calls = stubFetch({ '/v1/sdk/link': [200, { ok: true }] });

    await createMiaMoreClient(CONFIG).link({
      kind: 'android',
      purchaseToken: 'token',
      productId: 'yearly',
      environment: 'SANDBOX',
    });

    expect(bodyOf(calls[0])).toEqual({
      bundleId: 'com.example.app',
      customerUserId: 'device-1',
      obfuscatedAccountId: 'acct-1',
      environment: 'SANDBOX',
      purchaseToken: 'token',
      productId: 'yearly',
    });
  });
});

describe('updateAttribution', () => {
  it('sends only the fields that are set', async () => {
    const calls = stubFetch({ '/v1/sdk/attribution': [200, { ok: true }] });

    const client = createMiaMoreClient(CONFIG);

    await client.updateAttribution({ payload: { media_source: 'facebook' } });
    await client.updateAttribution({ appsflyerId: 'af-1' });

    expect(bodyOf(calls[0])).toEqual({
      bundleId: 'com.example.app',
      customerUserId: 'device-1',
      payload: { media_source: 'facebook' },
    });
    expect(bodyOf(calls[1])).toEqual({
      bundleId: 'com.example.app',
      customerUserId: 'device-1',
      appsflyerId: 'af-1',
    });
  });
});

describe('trackAppOpen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends at most once per 30 minutes', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });

    const calls = stubFetch({ '/v1/sdk/appOpen': [200, { ok: true }] });
    const client = createMiaMoreClient(CONFIG);

    await client.trackAppOpen();
    jest.setSystemTime(new Date('2026-01-01T00:29:00Z'));
    await client.trackAppOpen();

    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0])).toMatchObject({
      bundleId: 'com.example.app',
      customerUserId: 'device-1',
      openedAt: '2026-01-01T00:00:00.000Z',
    });

    jest.setSystemTime(new Date('2026-01-01T00:31:00Z'));
    await client.trackAppOpen();

    expect(calls).toHaveLength(2);
  });

  it('retries on the next call after a failed send', async () => {
    const calls = stubFetch({
      '/v1/sdk/appOpen': [
        [500, {}],
        [200, { ok: true }],
      ],
    });
    const client = createMiaMoreClient(CONFIG);

    await expect(client.trackAppOpen()).rejects.toMatchObject({ status: 500 });
    await client.trackAppOpen();

    expect(calls).toHaveLength(2);
  });

  it('keeps a separate throttle per client', async () => {
    const calls = stubFetch({ '/v1/sdk/appOpen': [200, { ok: true }] });

    await createMiaMoreClient(CONFIG).trackAppOpen();
    await createMiaMoreClient(CONFIG).trackAppOpen();

    expect(calls).toHaveLength(2);
  });
});
