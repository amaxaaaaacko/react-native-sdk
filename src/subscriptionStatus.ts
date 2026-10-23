import { requireConfiguration, type Configuration } from './MiaMoreSDK';
import { get, parseJson, post, throwIfError } from './http';
import { mapSubscriptionStatus, SubscriptionStatusDefaults, type Environment, type SubscriptionStatus, type WebClaimResult } from './types';

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

/**
 * Restore a web purchase by the payer's email (lost deep link, reinstall, another device). Mirrors
 * `claimWebPurchase(email:)` (Swift) and `claimWebPurchase(email)` (Kotlin).
 *
 * Calls `POST /v1/sdk/webClaim`, then fetches `getSubscriptionStatus()`. The email is saved on this
 * `customerUserId`'s profile even if nothing matches yet, so a web purchase whose webhook arrives later
 * still unlocks on the next `getSubscriptionStatus()`. The email is not verified by design. A malformed
 * email throws `{ type: 'http_error', status: 400, body: '…invalid_email…' }`.
 */
export async function claimWebPurchase(email: string): Promise<WebClaimResult> {
  const cfg = requireConfiguration();
  const result = await post(cfg, '/v1/sdk/webClaim', {
    bundleId: cfg.bundleId,
    customerUserId: cfg.customerUserId,
    email,
  });
  throwIfError(result);
  const claim = parseJson(result);
  return { found: Boolean(claim?.found), status: await getSubscriptionStatus() };
}
