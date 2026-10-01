import { requireConfiguration, type Configuration } from './MiaMoreSDK';
import { get, parseJson, post, throwIfError } from './http';
import { mapSubscriptionStatus, SubscriptionStatusDefaults, type Environment, type SubscriptionStatus } from './types';

/**
 * Fetch subscription status from the MiaMore backend. Requires the user to already be linked (see
 * `link` below, or `purchase`/`restore` in purchases.ts, which link automatically).
 *
 * A `404 {"error":"not_linked"}` response means "not linked yet" and is returned as an inactive
 * status rather than thrown, exactly like the Swift/Kotlin SDKs.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const cfg = requireConfiguration();
  const result = await get(cfg, '/v1/sdk/subscriptionStatus', {
    bundleId: cfg.bundleId,
    customerUserId: cfg.customerUserId,
  });

  if (result.status === 404) {
    const parsed = (() => {
      try {
        return JSON.parse(result.body);
      } catch {
        return null;
      }
    })();
    if (parsed?.error === 'not_linked') return SubscriptionStatusDefaults.inactive(cfg.environment);
  }

  throwIfError(result);
  return mapSubscriptionStatus(parseJson(result));
}

export type LinkParams =
  | { kind: 'apple'; originalTransactionId: string; environment?: Environment }
  | { kind: 'android'; purchaseToken: string; productId: string; environment?: Environment };

/**
 * Link `customerUserId` to a purchase so `getSubscriptionStatus` can resolve it later. `purchase`/
 * `restore` already call this best-effort - call it directly only if you need to (re)link manually.
 *
 * Mirrors `link(originalTransactionId:)` (Swift) and `link(purchaseToken, productId)` (Kotlin),
 * combined into one function discriminated by `kind` since a single RN app runs on both platforms.
 */
export async function link(params: LinkParams): Promise<void> {
  const cfg: Configuration = requireConfiguration();

  const body =
    params.kind === 'apple'
      ? {
          bundleId: cfg.bundleId,
          customerUserId: cfg.customerUserId,
          appAccountToken: cfg.accountId,
          environment: params.environment ?? cfg.environment,
          originalTransactionId: params.originalTransactionId,
        }
      : {
          bundleId: cfg.bundleId,
          customerUserId: cfg.customerUserId,
          obfuscatedAccountId: cfg.accountId,
          environment: params.environment ?? cfg.environment,
          purchaseToken: params.purchaseToken,
          productId: params.productId,
        };

  const result = await post(cfg, '/v1/sdk/link', body);
  throwIfError(result);
}
