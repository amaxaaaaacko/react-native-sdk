/**
 * Mirrors miamore-swift-sdk's Types.swift / miamore-kotlin-sdk's Types.kt. Field names here are
 * camelCase (idiomatic JS/TS) even though the backend speaks snake_case - see the `mapX` functions
 * in this file, which are the single place that translates wire JSON into these shapes.
 */

export type Environment = 'PROD' | 'SANDBOX' | 'UNKNOWN';

/** Where the active entitlement came from. `null`/undefined means an older backend response. */
export type SubscriptionSource = 'app_store' | 'web' | 'android' | 'unknown';

/** Web payment provider, present when `source === 'web'`. Unrecognized values map to 'unknown' - mirrors the lenient decoding in the Swift/Kotlin SDKs. */
export type PaymentProvider = 'stripe' | 'solidgate' | 'unknown';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export interface ProductRef {
  productId: string;
  sort?: number;
  /** Apple-only: up_front | monthly (12-month commitment). No Android equivalent - see offerToken. */
  billingPlanType?: string;
  /** Google Play Billing's base-plan/offer selector (offerTokenAndroid from react-native-iap's fetchProducts). No Apple equivalent. */
  offerToken?: string;
}

export interface Paywall {
  paywallId: string;
  name: string;
  products: ProductRef[];
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

export interface SubscriptionStatus {
  isActive: boolean;
  expiresAt: string | null;
  environment: Environment;
  /** Present for App Store subscriptions. Empty for Android/web-only subscriptions. */
  originalTransactionId: string;
  source: SubscriptionSource | null;
  provider: PaymentProvider | null;
  providerAccountId: string | null;
  providerChannelId: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  storeId: string | null;
  storeType: string | null;
  externalProductId: string | null;
  currentSubscriptionStatus: string | null;
  productId: string | null;
  priceId: string | null;
  entitlementId: string | null;
  trialType: string | null;
  billingPlanType: string | null;
  commitment: Commitment | null;
  updatedAt: string | null;
}

function toPaymentProvider(raw: unknown): PaymentProvider | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'stripe') return 'stripe';
  if (s === 'solidgate') return 'solidgate';
  return 'unknown';
}

function toSubscriptionSource(raw: unknown): SubscriptionSource | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'app_store' || s === 'web' || s === 'android') return s;
  return 'unknown';
}

export function mapPaywallResponse(json: any): PaywallResponse {
  return {
    appBundleId: json.app_bundle_id,
    customerUserId: json.customer_user_id,
    placement: json.placement ?? null,
    assignment: json.assignment
      ? { experimentId: json.assignment.experiment_id, variantId: json.assignment.variant_id, bucket: json.assignment.bucket }
      : null,
    paywall: {
      paywallId: json.paywall.paywall_id,
      name: json.paywall.name,
      products: (json.paywall.products ?? []).map((p: any) => ({
        productId: p.product_id,
        sort: p.sort ?? undefined,
        billingPlanType: p.billing_plan_type ?? undefined,
        offerToken: p.offer_token ?? undefined,
      })),
    },
  };
}

export function mapSubscriptionStatus(json: any): SubscriptionStatus {
  return {
    isActive: Boolean(json.is_active),
    expiresAt: json.expires_at ?? null,
    environment: (json.environment ?? 'PROD') as Environment,
    originalTransactionId: json.original_transaction_id ?? '',
    source: toSubscriptionSource(json.source),
    provider: toPaymentProvider(json.provider),
    providerAccountId: json.provider_account_id ?? null,
    providerChannelId: json.provider_channel_id ?? null,
    providerCustomerId: json.provider_customer_id ?? null,
    providerSubscriptionId: json.provider_subscription_id ?? null,
    storeId: json.store_id ?? null,
    storeType: json.store_type ?? null,
    externalProductId: json.external_product_id ?? null,
    currentSubscriptionStatus: json.current_subscription_status ?? null,
    productId: json.product_id ?? null,
    priceId: json.price_id ?? null,
    entitlementId: json.entitlement_id ?? null,
    trialType: json.trial_type ?? null,
    billingPlanType: json.billing_plan_type ?? null,
    commitment: json.commitment
      ? {
          expirationDate: json.commitment.expiration_date ?? null,
          billingPeriodNumber: json.commitment.billing_period_number ?? null,
          totalBillingPeriods: json.commitment.total_billing_periods ?? null,
          totalPrice: json.commitment.total_price ?? null,
          autoRenewStatus: json.commitment.auto_renew_status ?? null,
        }
      : null,
    updatedAt: json.updated_at ?? null,
  };
}

function inactiveSubscriptionStatus(environment: Environment): SubscriptionStatus {
  return {
    isActive: false,
    expiresAt: null,
    environment,
    originalTransactionId: '',
    source: null,
    provider: null,
    providerAccountId: null,
    providerChannelId: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
    storeId: null,
    storeType: null,
    externalProductId: null,
    currentSubscriptionStatus: null,
    productId: null,
    priceId: null,
    entitlementId: null,
    trialType: null,
    billingPlanType: null,
    commitment: null,
    updatedAt: null,
  };
}

export const SubscriptionStatusDefaults = { inactive: inactiveSubscriptionStatus };
