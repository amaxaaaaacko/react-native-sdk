import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getConfiguration, requireConfiguration } from './MiaMoreSDK';
import { post, throwIfError } from './http';

/** Manually track a basic app-open event. The SDK also auto-tracks this (~once per 30 minutes) after `startAppOpenAutoTracking()`. */
export async function trackAppOpen(): Promise<void> {
  const cfg = requireConfiguration();
  const result = await post(cfg, '/v1/sdk/appOpen', {
    bundleId: cfg.bundleId,
    customerUserId: cfg.customerUserId,
    openedAt: new Date().toISOString(),
    tzOffsetMin: -new Date().getTimezoneOffset(),
  });
  throwIfError(result);
}

const MIN_INTERVAL_MS = 30 * 60 * 1000;
function storageKey(bundleId: string): string {
  return `com.miamore.sdk.lastAppOpenSentAt.${bundleId}`;
}

let started = false;
let appStateSubscription: { remove: () => void } | null = null;

async function sendIfNeeded(): Promise<void> {
  const cfg = getConfiguration();
  if (!cfg) return;

  const key = storageKey(cfg.bundleId);
  const now = Date.now();
  const lastRaw = await AsyncStorage.getItem(key);
  const last = lastRaw ? Number(lastRaw) : 0;
  if (last > 0 && now - last < MIN_INTERVAL_MS) return;

  // Mark before the network call to avoid duplicate bursts from rapid foreground/background cycles.
  await AsyncStorage.setItem(key, String(now));
  try {
    await trackAppOpen();
  } catch (error) {
    // Allow a retry on the next foreground transition rather than losing the event.
    await AsyncStorage.removeItem(key);
    if (cfg.logLevel === 'debug') console.log('[MiaMore] appOpen tracking failed:', error);
  }
}

/**
 * Starts auto-tracking app-open events on every foreground transition (mirrors
 * `MiaMoreAppOpenAutoTracker` in Swift, `ProcessLifecycleOwner`-based tracking in Kotlin). Called
 * automatically by `configure()` in index.ts - most apps never need to call this directly.
 */
export function startAppOpenAutoTracking(): void {
  if (started) return;
  started = true;

  void sendIfNeeded();

  const handleAppStateChange = (state: AppStateStatus) => {
    if (state === 'active') void sendIfNeeded();
  };
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}

/** Mostly for tests; most apps never need to call this. */
export function stopAppOpenAutoTracking(): void {
  started = false;
  appStateSubscription?.remove();
  appStateSubscription = null;
}
