import { requireConfiguration } from './MiaMoreSDK';
import { get, parseJson, throwIfError } from './http';
import { mapPaywallResponse, type PaywallResponse } from './types';

export interface GetPaywallOptions {
  placement?: string;
  paywallId?: string;
  experimentId?: string;
}

/** `GET /v1/sdk/paywall`. Mirrors `getPaywall` in the Swift/Kotlin SDKs. */
export async function getPaywall(options: GetPaywallOptions = {}): Promise<PaywallResponse> {
  const cfg = requireConfiguration();

  const result = await get(cfg, '/v1/sdk/paywall', {
    bundleId: cfg.bundleId,
    customerUserId: cfg.customerUserId,
    placement: options.placement,
    paywallId: options.paywallId,
    experimentId: options.experimentId,
  });

  throwIfError(result);
  return mapPaywallResponse(parseJson(result));
}
