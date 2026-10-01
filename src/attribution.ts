import { requireConfiguration } from './MiaMoreSDK';
import { post, throwIfError } from './http';

/** Store AppsFlyer id (if you want it separately from `customerUserId`). */
export async function setAppsflyerIntegrationIdentifier(appsflyerId: string): Promise<void> {
  await updateAttribution({ appsflyerId });
}

/**
 * Store the Firebase Analytics App Instance ID for Firebase/Google Analytics server-side events.
 * Call this once per app launch after Firebase has been configured and `configure()` has run, and
 * before any purchase flow, so server-side subscription events can be attached to the installation.
 */
export async function setFirebaseIntegrationIdentifier(firebaseAppInstanceId: string): Promise<void> {
  await updateAttribution({ firebaseAppInstanceId });
}

export interface UpdateAttributionOptions {
  appsflyerId?: string;
  firebaseAppInstanceId?: string;
  payload?: Record<string, unknown>;
}

/** `POST /v1/sdk/attribution`. Mirrors `updateAttribution` in the Swift/Kotlin SDKs. */
export async function updateAttribution(options: UpdateAttributionOptions): Promise<void> {
  const cfg = requireConfiguration();
  const result = await post(cfg, '/v1/sdk/attribution', {
    bundleId: cfg.bundleId,
    customerUserId: cfg.customerUserId,
    ...(options.appsflyerId ? { appsflyerId: options.appsflyerId } : {}),
    ...(options.firebaseAppInstanceId ? { firebaseAppInstanceId: options.firebaseAppInstanceId } : {}),
    ...(options.payload ? { payload: options.payload } : {}),
  });
  throwIfError(result);
}
