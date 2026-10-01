import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Environment, LogLevel } from './types';

const ACCOUNT_ID_STORAGE_KEY = 'com.miamore.sdk.accountId';

export interface Configuration {
  baseUrl: string;
  /** App bundle id (iOS) / package name (Android). Used as the app key in the backend. */
  bundleId: string;
  /** Per-app SDK API key, from AdminJS. Do not hard-code or commit it. */
  apiKey: string;
  /** AppsFlyer-generated id, passed in from the app. */
  customerUserId: string;
  /**
   * Stable per-install id attached to purchases: StoreKit's `appAccountToken` on iOS, Play
   * Billing's `obfuscatedAccountId` on Android (same purpose, two different native parameter
   * names - see purchases.ts). If omitted, the SDK creates and persists a UUID in AsyncStorage.
   */
  accountId: string;
  environment: Environment;
  logLevel: LogLevel;
}

export type SDKError =
  | { type: 'not_configured' }
  | { type: 'invalid_response' }
  | { type: 'http_error'; status: number; body: string | null };

export function sdkErrorMessage(err: SDKError): string {
  switch (err.type) {
    case 'not_configured':
      return 'MiaMoreSDK.configure(...) has not been called yet.';
    case 'invalid_response':
      return 'The server returned a response that could not be understood.';
    case 'http_error':
      return `MiaMore backend returned HTTP ${err.status}` + (err.body ? `: ${err.body}` : '');
  }
}

function randomUuid(): string {
  // crypto.randomUUID() is not guaranteed available in the Hermes/JSC runtime without a polyfill,
  // so this SDK ships its own tiny RFC-4122-ish generator rather than taking a dependency on one.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function loadOrCreateAccountId(): Promise<string> {
  const existing = await AsyncStorage.getItem(ACCOUNT_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = randomUuid();
  await AsyncStorage.setItem(ACCOUNT_ID_STORAGE_KEY, created);
  return created;
}

let config: Configuration | null = null;

export interface ConfigureOptions {
  baseUrl: string;
  bundleId: string;
  apiKey: string;
  customerUserId: string;
  accountId?: string;
  environment?: Environment;
  logLevel?: LogLevel;
}

/** Low-level: resolves/persists the account id and stores the configuration. See `configure()` in index.ts for the full public entry point (this plus starting activity auto-tracking). */
export async function setConfiguration(opts: ConfigureOptions): Promise<Configuration> {
  const accountId = opts.accountId ?? (await loadOrCreateAccountId());
  config = {
    baseUrl: opts.baseUrl.replace(/\/+$/, ''),
    bundleId: opts.bundleId,
    apiKey: opts.apiKey,
    customerUserId: opts.customerUserId,
    accountId,
    environment: opts.environment ?? 'PROD',
    logLevel: opts.logLevel ?? 'info',
  };
  return config;
}

export function getConfiguration(): Configuration | null {
  return config;
}

export function requireConfiguration(): Configuration {
  if (!config) throw { type: 'not_configured' } satisfies SDKError;
  return config;
}

export const platformOS: 'ios' | 'android' | 'other' =
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other';
