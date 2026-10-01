import { setConfiguration, getConfiguration, type ConfigureOptions } from './MiaMoreSDK';
import { startAppOpenAutoTracking } from './activity';

/**
 * Configure the SDK once at app launch, before showing any paywall or making any other SDK call.
 * Mirrors `MiaMoreSDK.configure()` in the Swift/Kotlin SDKs: sets up the shared configuration and
 * starts best-effort app-open activity tracking (~once per 30 minutes per foreground transition).
 */
export async function configure(options: ConfigureOptions): Promise<void> {
  await setConfiguration(options);
  startAppOpenAutoTracking();
}

export { getConfiguration };
export type { Configuration, ConfigureOptions, SDKError } from './MiaMoreSDK';
export { sdkErrorMessage } from './MiaMoreSDK';

export type {
  Environment,
  SubscriptionSource,
  PaymentProvider,
  LogLevel,
  ProductRef,
  Paywall,
  Assignment,
  PaywallResponse,
  Commitment,
  SubscriptionStatus,
} from './types';

export { getPaywall, type GetPaywallOptions } from './paywalls';
export { getSubscriptionStatus, link, type LinkParams } from './subscriptionStatus';
export {
  setAppsflyerIntegrationIdentifier,
  setFirebaseIntegrationIdentifier,
  updateAttribution,
  type UpdateAttributionOptions,
} from './attribution';
export { trackAppOpen, startAppOpenAutoTracking, stopAppOpenAutoTracking } from './activity';
export {
  purchase,
  restorePurchases,
  purchaseErrorMessage,
  type PurchaseOutcome,
  type PurchaseError,
  type PurchaseOptions,
} from './purchases';
