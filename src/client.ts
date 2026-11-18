import { get, parseJson, post, throwIfError } from './api';
import { inactiveSubscriptionStatus, mapPaywallResponse, mapSubscriptionStatus } from './mappers';
import type { Environment, MiaMoreConfig } from './types';

const APP_OPEN_INTERVAL_MS = 30 * 60 * 1000;

/** Selects the paywall to load. Pass one of the fields; with none, the backend picks the default. */
export interface GetPaywallOptions {
  /** Placement id configured in AdminJS, e.g. a per-platform paywall slot. */
  placement?: string;
  /** Loads a specific paywall by id. */
  paywallId?: string;
  /** Loads the paywall assigned to the user in this experiment. */
  experimentId?: string;
}

export interface GetSubscriptionStatusOptions {
  /** Whose status to fetch. Defaults to the configured `customerUserId`. */
  customerUserId?: string;
}

/**
 * A finished store purchase to link to the configured `customerUserId`.
 * `environment` defaults to the configured one.
 */
export type LinkParams =
  | { kind: 'apple'; originalTransactionId: string; environment?: Environment }
  | {
      kind: 'android';
      purchaseToken: string;
      productId: string;
      environment?: Environment;
    };

export interface UpdateAttributionOptions {
  /** AppsFlyer id to store for server-side AppsFlyer events. */
  appsflyerId?: string;
  /** Arbitrary attribution data, e.g. AppsFlyer conversion data. */
  payload?: Record<string, unknown>;
}

const parseNotLinked = (body: string) => {
  try {
    return JSON.parse(body)?.error === 'not_linked';
  } catch {
    return false;
  }
};

/** Creates a client bound to one config. Apps get it from `useMiaMore()` instead of calling this. */
export const createMiaMoreClient = (options: MiaMoreConfig) => {
  const config = {
    ...options,
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    environment: options.environment ?? 'PROD',
  };

  const app = {
    bundleId: config.bundleId,
    customerUserId: config.customerUserId,
  };

  let lastAppOpenAt = 0;

  const getPaywall = async (paywallOptions: GetPaywallOptions = {}) => {
    const result = await get(config, '/v1/sdk/paywall', {
      ...app,
      ...paywallOptions,
    });

    throwIfError(result);

    return mapPaywallResponse(parseJson(result));
  };

  const getSubscriptionStatus = async ({ customerUserId }: GetSubscriptionStatusOptions = {}) => {
    const result = await get(config, '/v1/sdk/subscriptionStatus', {
      bundleId: config.bundleId,
      customerUserId: customerUserId ?? config.customerUserId,
    });

    if (result.status === 404 && parseNotLinked(result.body)) {
      return inactiveSubscriptionStatus(config.environment);
    }

    throwIfError(result);

    return mapSubscriptionStatus(parseJson(result));
  };

  const link = async (params: LinkParams) => {
    const body = Object.assign(
      {
        ...app,
        environment: params.environment ?? config.environment,
      },
      params.kind === 'apple'
        ? {
            appAccountToken: config.accountId,
            originalTransactionId: params.originalTransactionId,
          }
        : {
            obfuscatedAccountId: config.accountId,
            purchaseToken: params.purchaseToken,
            productId: params.productId,
          },
    );

    throwIfError(await post(config, '/v1/sdk/link', body));
  };

  const updateAttribution = async ({ appsflyerId, payload }: UpdateAttributionOptions) => {
    const result = await post(config, '/v1/sdk/attribution', {
      ...app,
      ...(appsflyerId && { appsflyerId }),
      ...(payload && { payload }),
    });

    throwIfError(result);
  };

  const trackAppOpen = async () => {
    const now = Date.now();

    if (lastAppOpenAt > 0 && now - lastAppOpenAt < APP_OPEN_INTERVAL_MS) {
      return;
    }

    lastAppOpenAt = now;

    try {
      const result = await post(config, '/v1/sdk/appOpen', {
        ...app,
        openedAt: new Date(now).toISOString(),
        tzOffsetMin: -new Date(now).getTimezoneOffset(),
      });

      throwIfError(result);
    } catch (error) {
      lastAppOpenAt = 0;

      throw error;
    }
  };

  return {
    /** The config the client was created with: `baseUrl` without a trailing slash, `environment` filled in. */
    config,
    /**
     * Loads a paywall: its products in display order and the user's A/B assignment.
     * Prices and trials are not included — read them from the store.
     * @throws MiaMoreError on a non-2xx response or an unreadable body.
     */
    getPaywall,
    /**
     * Fetches the subscription status of the configured user, or of any other `customerUserId`.
     * A user with no linked purchase gets an inactive status instead of an error.
     * @throws MiaMoreError on any other non-2xx response or an unreadable body.
     */
    getSubscriptionStatus,
    /**
     * Links a store purchase to the configured user so `getSubscriptionStatus` finds it.
     * Sends `accountId` as `appAccountToken` (Apple) or `obfuscatedAccountId` (Google).
     * Safe to repeat for the same purchase.
     * @throws MiaMoreError on a non-2xx response.
     */
    link,
    /**
     * Sends attribution data for the configured user. Only the fields that are set are sent.
     * @throws MiaMoreError on a non-2xx response.
     */
    updateAttribution,
    /**
     * Records an app open. Call at launch and on every return to the foreground.
     * Sends at most once per 30 minutes per client; a failed send is retried on the next call.
     * @throws MiaMoreError on a non-2xx response.
     */
    trackAppOpen,
  };
};
