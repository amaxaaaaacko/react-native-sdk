jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

import { setConfiguration } from '../MiaMoreSDK';
import { claimWebPurchase } from '../subscriptionStatus';

type Call = { url: string; init: RequestInit };

function stubFetch(responses: Record<string, [number, unknown]>): Call[] {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const [status, body] = responses[new URL(String(url)).pathname] ?? [404, {}];
    return { status, text: async () => JSON.stringify(body) } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe('claimWebPurchase', () => {
  beforeEach(async () => {
    await setConfiguration({
      baseUrl: 'https://stub.miamore.test/',
      bundleId: 'com.example.app',
      apiKey: 'sdk_key',
      customerUserId: 'device-1',
      accountId: 'acct-1',
    });
  });

  it('posts the email for this user, then returns the refreshed status', async () => {
    const calls = stubFetch({
      '/v1/sdk/webClaim': [200, { ok: true, found: true, is_active: true }],
      '/v1/sdk/subscriptionStatus': [
        200,
        { is_active: true, environment: 'PROD', source: 'web', provider: 'paddle', customer_email: 'buyer@example.com' },
      ],
    });

    const result = await claimWebPurchase('Buyer@Example.com');

    expect(result.found).toBe(true);
    expect(result.status.isActive).toBe(true);
    expect(result.status.customerEmail).toBe('buyer@example.com');
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/v1/sdk/webClaim', '/v1/sdk/subscriptionStatus']);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ bundleId: 'com.example.app', customerUserId: 'device-1', email: 'Buyer@Example.com' });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sdk_key');
  });

  it('throws the backend error for a malformed email and does not fetch the status', async () => {
    const calls = stubFetch({ '/v1/sdk/webClaim': [400, { error: 'invalid_email' }] });

    await expect(claimWebPurchase('not-an-email')).rejects.toMatchObject({ type: 'http_error', status: 400 });
    expect(calls).toHaveLength(1);
  });
});
