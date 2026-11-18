import { render, renderHook } from '@testing-library/react';
import type { MiaMoreClient, MiaMoreConfig } from '../types';
import { MiaMoreProvider, useMiaMore } from '../provider';

const CONFIG: MiaMoreConfig = {
  baseUrl: 'https://stub.miamore.test',
  bundleId: 'com.example.app',
  apiKey: 'sdk_key',
  customerUserId: 'device-1',
  accountId: 'acct-1',
};

interface ProbeResult {
  current: MiaMoreClient | null;
}

const fetchMock = jest.fn(async () => ({ status: 200, text: async () => '{}' }));

const renderMiaMore = (config: MiaMoreConfig | null) => {
  const result: ProbeResult = { current: null };

  const Probe = () => {
    result.current = useMiaMore();

    return null;
  };

  const tree = (current: MiaMoreConfig | null) => (
    <MiaMoreProvider config={current}>
      <Probe />
    </MiaMoreProvider>
  );

  const { rerender } = render(tree(config));

  return { result, rerender: (next: MiaMoreConfig | null) => rerender(tree(next)) };
};

describe('MiaMoreProvider', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('has no client until it gets a config', () => {
    const { result } = renderMiaMore(null);

    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates the client once configured and keeps it across re-renders without sending requests', () => {
    const { result, rerender } = renderMiaMore(null);

    rerender(CONFIG);

    expect(result.current?.config.customerUserId).toBe('device-1');

    const client = result.current;

    rerender(CONFIG);

    expect(result.current).toBe(client);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useMiaMore())).toThrow(
      'useMiaMore must be used within MiaMoreProvider',
    );
  });
});
