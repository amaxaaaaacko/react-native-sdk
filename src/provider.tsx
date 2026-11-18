'use client';

import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { createMiaMoreClient } from './client';
import type { MiaMoreClient, MiaMoreConfig } from './types';

interface MiaMoreProviderProps extends PropsWithChildren {
  /** `null` until the ids are known. Keep the object stable: a new object creates a new client. */
  config: MiaMoreConfig | null;
}

interface MiaMoreContextValue {
  client: MiaMoreClient | null;
}

const MiaMoreContext = createContext<MiaMoreContextValue | null>(null);

/** Creates the MiaMore client from `config` and provides it to `useMiaMore()`. Sends no requests itself. */
export const MiaMoreProvider = ({ config, children }: MiaMoreProviderProps) => {
  const client = useMemo(() => (config ? createMiaMoreClient(config) : null), [config]);

  const value = useMemo(() => ({ client }), [client]);

  return <MiaMoreContext.Provider value={value}>{children}</MiaMoreContext.Provider>;
};

/**
 * The MiaMore client, or `null` while the provider has no config.
 * @throws Error when used outside `MiaMoreProvider`.
 */
export const useMiaMore = () => {
  const value = useContext(MiaMoreContext);

  if (!value) {
    throw new Error('useMiaMore must be used within MiaMoreProvider');
  }

  return value.client;
};
