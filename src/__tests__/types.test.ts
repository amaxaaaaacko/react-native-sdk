import { mapPaywallResponse, mapSubscriptionStatus, SubscriptionStatusDefaults } from '../types';

describe('mapPaywallResponse', () => {
  it('maps a full paywall response, including the offer_token/billing_plan_type passthroughs', () => {
    const json = {
      app_bundle_id: 'com.example.app',
      customer_user_id: 'cuid-1',
      placement: 'main',
      assignment: { experiment_id: 'exp-1', variant_id: 'var-1', bucket: 3 },
      paywall: {
        paywall_id: 'main_paywall',
        name: 'Main',
        products: [
          { product_id: 'yearly', sort: 1, billing_plan_type: 'up_front' },
          { product_id: 'yearly', sort: 2, billing_plan_type: 'monthly' },
          { product_id: 'android_sub', sort: 3, offer_token: 'offer-abc' },
        ],
      },
    };

    const result = mapPaywallResponse(json);

    expect(result.appBundleId).toBe('com.example.app');
    expect(result.assignment).toEqual({ experimentId: 'exp-1', variantId: 'var-1', bucket: 3 });
    expect(result.paywall.products).toHaveLength(3);
    expect(result.paywall.products[1]).toMatchObject({ productId: 'yearly', billingPlanType: 'monthly' });
    expect(result.paywall.products[2]).toMatchObject({ productId: 'android_sub', offerToken: 'offer-abc' });
  });

  it('defaults placement/assignment to null when absent', () => {
    const result = mapPaywallResponse({
      app_bundle_id: 'com.example.app',
      customer_user_id: 'cuid-1',
      paywall: { paywall_id: 'p', name: 'P', products: [] },
    });

    expect(result.placement).toBeNull();
    expect(result.assignment).toBeNull();
    expect(result.paywall.products).toEqual([]);
  });
});

describe('mapSubscriptionStatus', () => {
  it('maps an Apple-sourced active subscription', () => {
    const result = mapSubscriptionStatus({
      is_active: true,
      expires_at: '2026-12-01T00:00:00.000Z',
      environment: 'PROD',
      original_transaction_id: '123456789',
      source: 'app_store',
      current_subscription_status: 'active',
      product_id: 'com.example.yearly',
      billing_plan_type: 'up_front',
      commitment: null,
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    expect(result.isActive).toBe(true);
    expect(result.source).toBe('app_store');
    expect(result.originalTransactionId).toBe('123456789');
    expect(result.provider).toBeNull();
  });

  it('maps an android-sourced subscription and a lenient/unknown provider', () => {
    const result = mapSubscriptionStatus({
      is_active: true,
      expires_at: '2026-12-01T00:00:00.000Z',
      environment: 'PROD',
      source: 'android',
      provider: 'not-a-real-provider',
      store_id: 'google_play',
      product_id: 'com.example.yearly',
    });

    expect(result.source).toBe('android');
    expect(result.provider).toBe('unknown');
    expect(result.storeId).toBe('google_play');
  });

  it('treats an unrecognized source as unknown rather than throwing', () => {
    const result = mapSubscriptionStatus({ is_active: false, source: 'some_future_platform' });
    expect(result.source).toBe('unknown');
  });

  it('builds a correct inactive default for the not_linked case', () => {
    const result = SubscriptionStatusDefaults.inactive('SANDBOX');
    expect(result).toMatchObject({ isActive: false, environment: 'SANDBOX', originalTransactionId: '' });
  });
});
