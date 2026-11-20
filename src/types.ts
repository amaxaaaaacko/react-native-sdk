import type { createMiaMoreClient } from './client';

export type Environment = 'PROD' | 'SANDBOX' | 'UNKNOWN';

export type SubscriptionSource = 'app_store' | 'web' | 'android' | 'unknown';

export type PaymentProvider = 'stripe' | 'solidgate' | 'paddle' | 'unknown';

/** A paywall product. The same store product can appear several times with different plans. */
export interface Product {
  /** Store product id (App Store / Google Play). */
  productId: string;
  /** Display order within the paywall. */
  sort?: number;
  /** Apple only: `up_front` or `monthly` (paid monthly with a 12-month commitment). */
  billingPlanType?: string;
  /** Google Play only: base plan / offer token to buy. */
  offerToken?: string;
}

export interface Paywall {
  paywallId: string;
  name: string;
  products: Product[];
}

export interface Assignment {
  experimentId: string;
  variantId: string;
  bucket: number;
}

export interface PaywallResponse {
  appBundleId: string;
  customerUserId: string;
  placement: string | null;
  assignment: Assignment | null;
  paywall: Paywall;
}

export interface Commitment {
  expirationDate: string | null;
  billingPeriodNumber: number | null;
  totalBillingPeriods: number | null;
  totalPrice: string | null;
  autoRenewStatus: string | null;
}

/** A user's subscription as MiaMore sees it, across App Store, Google Play and web purchases. */
export interface SubscriptionStatus {
  /** Whether the user has access now. Unlock from this field only. */
  isActive: boolean;
  /** ISO date the current period ends, if known. */
  expiresAt: string | null;
  environment: Environment;
  /** App Store original transaction id; empty for Google Play and web subscriptions. */
  originalTransactionId: string;
  /** Where the subscription was bought; `null` on older backend responses. */
  source: SubscriptionSource | null;
  /** Web payment provider, set when `source` is `web`. */
  provider: PaymentProvider | null;
  providerAccountId: string | null;
  providerChannelId: string | null;
  /** Web provider's customer id, e.g. a Paddle `ctm_…` id. */
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  storeId: string | null;
  storeType: string | null;
  externalProductId: string | null;
  currentSubscriptionStatus: string | null;
  productId: string | null;
  priceId: string | null;
  entitlementId: string | null;
  /** Trial kind, e.g. `free_trial` or `paid_trial`; `null` when not in a trial. */
  trialType: string | null;
  /** Apple billing plan of the active product: `up_front` or `monthly`. */
  billingPlanType: string | null;
  /** Commitment details for monthly-billed plans with a 12-month commitment. */
  commitment: Commitment | null;
  updatedAt: string | null;
  /** Payer email from a web purchase, or the email used to restore one; `null` when unknown. */
  customerEmail: string | null;
}

/** Settings for one MiaMore client. */
export interface MiaMoreConfig {
  /** MiaMore SDK service URL. A trailing slash is fine. */
  baseUrl: string;
  /** App key registered in AdminJS: iOS bundle id / Android package name. */
  bundleId: string;
  /** Per-app SDK API key from AdminJS. Ships inside the app, so it is public. */
  apiKey: string;
  /** Id entitlements are keyed by. Keep it stable: purchases are linked to it. */
  customerUserId: string;
  /** Stable per-install id sent when linking. Pass the same value to the store as `appAccountToken` / `obfuscatedAccountId`. */
  accountId: string;
  /** `PROD` (default) or `SANDBOX`. */
  environment?: Environment;
}

/** MiaMore backend client returned by `useMiaMore()`. */
export type MiaMoreClient = ReturnType<typeof createMiaMoreClient>;
