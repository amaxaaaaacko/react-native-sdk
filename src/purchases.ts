import { Platform } from 'react-native';
import {
  initConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  ErrorCode,
  type Purchase,
  type PurchaseError as IapPurchaseError,
} from 'react-native-iap';
import { requireConfiguration } from './MiaMoreSDK';
import { link } from './subscriptionStatus';

/**
 * Wraps `react-native-iap` (OpenIAP/Nitro-based, v16+) for subscription purchases. Mirrors the
 * purchase/restore surface of Purchases.swift / Purchases.kt as closely as the underlying
 * libraries (StoreKit 2 vs Play Billing vs react-native-iap) allow - see this package's README's
 * "Differences from the native SDKs" section for the couple of unavoidable shape differences.
 *
 * All react-native-iap field names used here were verified against the shipped v16.7.2 type
 * declarations (not just its docs site, which was out of date in places at the time this was
 * written) - see RequestSubscriptionAndroidProps/RequestSubscriptionIosProps, SubscriptionOffer,
 * PurchaseCommon/PurchaseIOS/PurchaseAndroid in react-native-iap's types.d.ts if this ever needs
 * re-verifying against a newer major version.
 */

export type PurchaseOutcome =
  | {
      type: 'success';
      productId: string;
      /** iOS: StoreKit transaction id. Android: Play order id (or the purchase token as a fallback - see react-native-iap's Purchase.id docs). */
      transactionId: string;
      /** iOS only. */
      originalTransactionId?: string;
      /** Android only. */
      purchaseToken?: string;
    }
  | { type: 'pending' }
  | { type: 'user_cancelled' };

export type PurchaseError =
  | { type: 'product_not_found' }
  | { type: 'no_offer_available' }
  | { type: 'purchase_in_progress' }
  | { type: 'iap_error'; code: string; message: string };

export function purchaseErrorMessage(err: PurchaseError): string {
  switch (err.type) {
    case 'product_not_found':
      return 'No subscription product found in the store catalog for the given product id.';
    case 'no_offer_available':
      return 'No subscription offer available for this product on Android; pass an explicit offerToken.';
    case 'purchase_in_progress':
      return 'A purchase is already in progress.';
    case 'iap_error':
      return `${err.code}: ${err.message}`;
  }
}

export interface PurchaseOptions {
  /** Google Play offer token (ProductRef.offerToken from the paywall response). Falls back to the product's first available offer if omitted. Ignored on iOS. */
  offerToken?: string;
  /**
   * Apple billing-plan selector (ProductRef.billingPlanType from the paywall response, i.e. our
   * backend's wire format: 'up_front' | 'monthly'). Mapped internally to react-native-iap's own
   * SubscriptionBillingPlanTypeIOS values ('up-front' | 'monthly' - note the hyphen, which does NOT
   * match our wire format's underscore). Ignored on Android.
   */
  billingPlanType?: 'up_front' | 'monthly';
}

function toIosBillingPlanType(value: PurchaseOptions['billingPlanType']): 'up-front' | 'monthly' | null {
  if (value === 'up_front') return 'up-front';
  if (value === 'monthly') return 'monthly';
  return null;
}

let connectionReady: Promise<boolean> | null = null;
let listenersRegistered = false;
let pending: { productId: string; resolve: (v: PurchaseOutcome) => void; reject: (e: unknown) => void } | null = null;

function registerListenersOnce(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  purchaseUpdatedListener((purchase: Purchase) => {
    void handlePurchaseUpdate(purchase);
  });

  purchaseErrorListener((error: IapPurchaseError) => {
    const current = pending;
    pending = null;
    if (!current) return; // Error for a purchase we're not awaiting (e.g. background reconciliation) - nothing to resolve.
    if (error.code === ErrorCode.UserCancelled) {
      current.resolve({ type: 'user_cancelled' });
    } else {
      current.reject({ type: 'iap_error', code: error.code, message: error.message } satisfies PurchaseError);
    }
  });
}

async function ensureConnected(): Promise<void> {
  if (!connectionReady) {
    connectionReady = initConnection();
  }
  const connected = await connectionReady;
  if (!connected) {
    connectionReady = null;
    throw { type: 'iap_error', code: 'connection-failed', message: 'Store connection could not be established.' } satisfies PurchaseError;
  }
  registerListenersOnce();
}

/**
 * Acknowledges the purchase (required on Android within 3 days or Play auto-refunds it - no
 * StoreKit equivalent) and best-effort links it to the current `customerUserId`.
 */
async function handlePurchaseUpdate(purchase: Purchase): Promise<void> {
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch {
    // Best-effort: a failed finish/acknowledge here shouldn't block reporting the purchase outcome.
  }

  const outcome = outcomeFor(purchase);
  try {
    if (Platform.OS === 'ios' && outcome.originalTransactionId) {
      await link({ kind: 'apple', originalTransactionId: outcome.originalTransactionId });
    } else if (Platform.OS === 'android' && outcome.purchaseToken) {
      await link({ kind: 'android', purchaseToken: outcome.purchaseToken, productId: outcome.productId });
    }
  } catch {
    // Swallow: the app can call link() manually, and getSubscriptionStatus's lazy re-verify
    // (server-side) can recover from a missed link in some cases.
  }

  const current = pending;
  if (current && current.productId === outcome.productId) {
    pending = null;
    current.resolve(outcome);
  }
}

type PurchaseSuccessOutcome = Extract<PurchaseOutcome, { type: 'success' }>;

function outcomeFor(purchase: Purchase): PurchaseSuccessOutcome {
  const anyPurchase = purchase as any;
  return {
    type: 'success',
    productId: purchase.productId,
    transactionId: purchase.id,
    originalTransactionId: anyPurchase.originalTransactionIdentifierIOS ?? undefined,
    purchaseToken: purchase.purchaseToken ?? undefined,
  };
}

/**
 * Purchase a subscription. Resolves once the store reports an outcome (success/pending/cancelled)
 * via react-native-iap's event listeners - `requestPurchase`'s own return value is not the result,
 * see react-native-iap's docs for why.
 */
export async function purchase(productId: string, options: PurchaseOptions = {}): Promise<PurchaseOutcome> {
  if (pending) throw { type: 'purchase_in_progress' } satisfies PurchaseError;

  const cfg = requireConfiguration();
  await ensureConnected();

  let offerToken = options.offerToken;
  if (Platform.OS === 'android' && !offerToken) {
    const products = (await fetchProducts({ skus: [productId], type: 'subs' })) ?? [];
    const match = products.find((p) => p.id === productId) as any;
    const firstOffer = match?.subscriptionOffers?.[0];
    if (!firstOffer?.offerTokenAndroid) throw { type: 'no_offer_available' } satisfies PurchaseError;
    offerToken = firstOffer.offerTokenAndroid;
  }

  const outcomePromise = new Promise<PurchaseOutcome>((resolve, reject) => {
    pending = { productId, resolve, reject };
  });

  try {
    await requestPurchase({
      request: {
        apple: { sku: productId, appAccountToken: cfg.accountId, billingPlanType: toIosBillingPlanType(options.billingPlanType) },
        google: {
          skus: [productId],
          subscriptionOffers: offerToken ? [{ sku: productId, offerToken }] : null,
          obfuscatedAccountId: cfg.accountId,
        },
      },
      type: 'subs',
    });
  } catch (error) {
    pending = null;
    throw error;
  }

  return outcomePromise;
}

/**
 * Restore purchases via `getAvailablePurchases()` - the closest equivalent of the Swift SDK's
 * `restore()` (`AppStore.sync()` + current entitlements) and the Kotlin SDK's `restore()`
 * (`queryPurchasesAsync`). Acknowledges anything left unacknowledged and best-effort re-links each.
 */
export async function restorePurchases(): Promise<PurchaseOutcome[]> {
  await ensureConnected();
  const purchases = await getAvailablePurchases();
  const outcomes: PurchaseOutcome[] = [];
  for (const p of purchases) {
    await handlePurchaseUpdateForRestore(p);
    outcomes.push(outcomeFor(p));
  }
  return outcomes;
}

async function handlePurchaseUpdateForRestore(purchase: Purchase): Promise<void> {
  // Same acknowledge+link steps as handlePurchaseUpdate, without touching `pending` (restore isn't
  // correlated to a single in-flight requestPurchase() call).
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch {
    // Best-effort.
  }
  const outcome = outcomeFor(purchase);
  try {
    if (Platform.OS === 'ios' && outcome.originalTransactionId) {
      await link({ kind: 'apple', originalTransactionId: outcome.originalTransactionId });
    } else if (Platform.OS === 'android' && outcome.purchaseToken) {
      await link({ kind: 'android', purchaseToken: outcome.purchaseToken, productId: outcome.productId });
    }
  } catch {
    // Best-effort.
  }
}
