import type {
  Environment,
  PaymentProvider,
  PaywallResponse,
  SubscriptionSource,
  SubscriptionStatus,
} from './types';

const PAYMENT_PROVIDERS: PaymentProvider[] = ['stripe', 'solidgate', 'paddle'];

const SUBSCRIPTION_SOURCES: SubscriptionSource[] = ['app_store', 'web', 'android'];

const normalize = (raw: unknown) => String(raw).trim().toLowerCase();

const toPaymentProvider = (raw: unknown) => {
  if (raw == null) {
    return null;
  }

  return PAYMENT_PROVIDERS.find((provider) => provider === normalize(raw)) ?? 'unknown';
};

const toSubscriptionSource = (raw: unknown) => {
  if (raw == null) {
    return null;
  }

  return SUBSCRIPTION_SOURCES.find((source) => source === normalize(raw)) ?? 'unknown';
};

export const mapPaywallResponse = (json: any): PaywallResponse => ({
  appBundleId: json.app_bundle_id,
  customerUserId: json.customer_user_id,
  placement: json.placement ?? null,
  assignment: json.assignment
    ? {
        experimentId: json.assignment.experiment_id,
        variantId: json.assignment.variant_id,
        bucket: json.assignment.bucket,
      }
    : null,
  paywall: {
    paywallId: json.paywall.paywall_id,
    name: json.paywall.name,
    products: (json.paywall.products ?? []).map((product: any) => ({
      productId: product.product_id,
      sort: product.sort ?? undefined,
      billingPlanType: product.billing_plan_type ?? undefined,
      offerToken: product.offer_token ?? undefined,
    })),
  },
});

export const mapSubscriptionStatus = (json: any): SubscriptionStatus => ({
  isActive: Boolean(json.is_active),
  expiresAt: json.expires_at ?? null,
  environment: json.environment ?? 'PROD',
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
  customerEmail: json.customer_email ?? null,
});

export const inactiveSubscriptionStatus = (environment: Environment): SubscriptionStatus => ({
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
  customerEmail: null,
});
