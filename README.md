# MiaMore React Native SDK

React Native SDK for MiaMore, **for Expo projects**. Fetches **paywalls/products**, supports
**subscription purchases** (via [`expo-iap`](https://www.openiap.dev/) v5+, the OpenIAP-based IAP
library built for Expo's module/config-plugin system), and fetches **subscription status** from
the backend. It's the third MiaMore client SDK, alongside
[`miamore-swift-sdk`](https://github.com/amaxaaaaacko/miamore-swift-sdk) (iOS) and
[`miamore-kotlin-sdk`](https://github.com/amaxaaaaacko/miamore-kotlin-sdk) (Android) - this
package mirrors their API shape as closely as a single cross-platform JS runtime allows. See
[Differences from the native SDKs](#differences-from-the-native-sdks) for the handful of
unavoidable gaps.

> The SDK is **one library** shared across projects. You do **not** hardcode bundle ids per
> build. Each app uses its own `bundleId` and `apiKey` configured in AdminJS.

> **Expo only.** Purchases are implemented on top of `expo-iap`, which requires the Expo module
> runtime (a bare React Native project without Expo installed cannot use `purchase()`/
> `restorePurchases()`). `expo-iap` and the older `react-native-iap` are both OpenIAP
> implementations with an otherwise identical generated API, so a future bare-RN variant of this
> SDK - if ever needed - would mostly be a matter of swapping the import in `src/purchases.ts`, not
> a rewrite.

---

## Installation

Not published to npm - install straight from GitHub, pinned to a tag, same pattern as the Swift
SDK (SwiftPM from a git tag) and the Kotlin SDK (JitPack from a git tag):

```bash
npm install github:amaxaaaaacko/react-native-sdk#v0.1.0
```

### Peer dependencies

This package has no native code of its own - it's pure TypeScript - but subscription purchases are
implemented on top of `expo-iap`, which does:

```bash
npx expo install expo-iap @react-native-async-storage/async-storage
```

Add the config plugin to `app.json` (it configures the native iOS/Android project files for you
during `npx expo prebuild` - no manual Podfile/Gradle editing):

```json
{
  "expo": {
    "plugins": ["expo-iap"]
  }
}
```

On iOS, also enable the **In-App Purchase** capability (Xcode: Target → Signing & Capabilities →
+ Capability → In-App Purchase) and set a deployment target matching your Expo SDK version (e.g.
`"ios": { "deploymentTarget": "16.4" }` for Expo SDK 57+).

**Requirements** (inherited from `expo-iap`): Android `minSdkVersion` 23+ / `compileSdkVersion`
36+. See [`expo-iap`'s own installation guide](https://www.openiap.dev/docs/setup/expo) for the
current details - this SDK just wraps it, it doesn't fork or pin its native requirements.

### Expo Go

In-app purchases need native modules that **are not available in Expo Go** - this is true of every
IAP library, not specific to `expo-iap`. Use a
[custom dev client](https://docs.expo.dev/develop/development-builds/introduction/)
(`npx expo prebuild` + `eas build --profile development`, or `expo run:ios` / `expo run:android`
locally). Everything else in this SDK (paywalls, subscription status, attribution, activity
tracking) is plain JS/fetch and works fine in Expo Go on its own - only `purchase()`/
`restorePurchases()` need the dev client.

---

## Initialization

Call once at app launch, before showing any paywall:

```ts
import { configure } from 'miamore-react-native-sdk';

await configure({
  baseUrl: 'https://<your-sdk-service>',
  bundleId: 'com.example.app', // iOS bundle id / Android package name
  apiKey: '<sdk_api_key from AdminJS>',
  customerUserId: appsFlyerCustomerUserId,
  environment: 'PROD', // or 'SANDBOX'
  logLevel: 'info',
});
```

| Param | Notes |
|---|---|
| `baseUrl` | Your SDK service base URL. |
| `bundleId` | Must match `apps/{bundleId}` in Firestore. |
| `apiKey` | Per-app SDK API key (from AdminJS). **Do not hard-code or commit it.** |
| `customerUserId` | AppsFlyer-generated id, passed in from the app. |
| `accountId` | Optional. Stable per-install id attached to purchases (StoreKit's `appAccountToken` / Play Billing's `obfuscatedAccountId` - see below). If omitted, the SDK creates and persists one in `AsyncStorage`. |
| `environment` | `'PROD'` (default) or `'SANDBOX'`. |
| `logLevel` | `'debug' | 'info' | 'warn' | 'error' | 'none'` (default `'info'`). |

---

## Paywalls / Products

```ts
import { getPaywall } from 'miamore-react-native-sdk';

const res = await getPaywall({ placement: 'main' });
const paywall = res.paywall;

for (const p of paywall.products) {
  console.log(p.productId, p.billingPlanType, p.offerToken);
}
```

Or fetch by id / experiment id: `getPaywall({ paywallId: 'main_paywall_v1' })`.

A yearly product can appear more than once with different `billingPlanType` values (Apple's
up-front-vs-monthly-with-commitment distinction), and/or carry an `offerToken` (Google Play's
base-plan/offer selector - a different concept, see below). Pass whichever one applies straight
into `purchase()`.

---

## Purchases

```ts
import { purchase, restorePurchases } from 'miamore-react-native-sdk';

const outcome = await purchase('com.example.pro.yearly');
switch (outcome.type) {
  case 'success':
    console.log('purchased', outcome.productId);
    break;
  case 'pending':
    console.log('requires action outside the app (e.g. a pending cash payment)');
    break;
  case 'user_cancelled':
    break;
}
```

With an Android offer token or an Apple billing plan (both come from `ProductRef` in the paywall
response - pass whichever one is non-null for the current platform, the other is ignored):

```ts
await purchase('com.example.pro.yearly', {
  offerToken: product.offerToken, // Android only
  billingPlanType: product.billingPlanType as 'up_front' | 'monthly', // iOS only
});
```

`purchase()`/`restorePurchases()` acknowledge/finish the transaction and best-effort call `link()`
for you - you don't need to call `link` yourself in the common case. `restorePurchases()` re-syncs
with the store and returns every currently-owned subscription's outcome.

Errors thrown by `purchase`/`restorePurchases` are a `PurchaseError` discriminated union
(`product_not_found`, `no_offer_available`, `purchase_in_progress`, `iap_error`) - see
[Callbacks / Errors](#callbacks--errors).

---

## Profile / Subscription Status

```ts
import { getSubscriptionStatus } from 'miamore-react-native-sdk';

const status = await getSubscriptionStatus();
if (status.isActive) {
  // unlock premium
}
```

`status.source` is `'app_store'`, `'android'`, `'web'`, or `null`/`'unknown'` for an older/
unrecognized backend response. Always unlock from `status.isActive` - don't branch only on Apple
fields, since Android/web-only subscriptions don't have an `originalTransactionId`.

### Manual linking

`purchase()`/`restorePurchases()` call this for you. Call it directly only if you need to
(re)link explicitly - e.g. after reconciling a purchase your own code observed some other way:

```ts
import { link } from 'miamore-react-native-sdk';

// iOS
await link({ kind: 'apple', originalTransactionId });
// Android
await link({ kind: 'android', purchaseToken, productId });
```

---

## Attribution

```ts
import { setAppsflyerIntegrationIdentifier, setFirebaseIntegrationIdentifier } from 'miamore-react-native-sdk';

await setAppsflyerIntegrationIdentifier(appsFlyerCustomerUserId);

// After Firebase is configured and `configure()` has run, before any purchase flow:
const firebaseAppInstanceId = await analytics().getAppInstanceId(); // @react-native-firebase/analytics
if (firebaseAppInstanceId) {
  await setFirebaseIntegrationIdentifier(firebaseAppInstanceId);
}
```

The SDK intentionally does not depend on Firebase - pass in whatever your app already has
configured. `updateAttribution({ appsflyerId?, firebaseAppInstanceId?, payload? })` is also
available directly for sending an arbitrary attribution payload.

---

## Callbacks / Errors

This SDK uses `async`/`await` throughout. Thrown errors are plain discriminated-union objects
(not `Error` instances) so callers can `switch` on `.type` without an `instanceof` check:

- `SDKError`: `not_configured` | `invalid_response` | `http_error` (`{ status, body }`)
- `PurchaseError`: `product_not_found` | `no_offer_available` | `purchase_in_progress` | `iap_error` (`{ code, message }`)

`sdkErrorMessage(err)` / `purchaseErrorMessage(err)` turn either into a human-readable string.

---

## Differences from the native SDKs

Purchases on Android/iOS fundamentally differ (Play Billing vs StoreKit), and `expo-iap`
adds its own abstraction on top - a few shape differences are unavoidable and intentional, not
bugs:

- **No single purchase outcome type across retries.** `requestPurchase()` doesn't return the
  purchase result directly (it's delivered async via `expo-iap`'s event listeners); this
  SDK bridges that into a normal awaitable `purchase()` promise for you, but if `requestPurchase`
  throws synchronously (e.g. invalid arguments) vs. the listener reporting failure, see
  `PurchaseError.iap_error` either way.
- **`offerToken` (Android) vs `billingPlanType` (iOS) are different concepts**, not the same field
  under two names - don't try to force one onto the other. See `ProductRef` in the paywall
  response.
- **`accountId`** is this SDK's one name for what the Swift SDK calls `appAccountToken` and the
  Kotlin SDK calls `obfuscatedAccountId` - same purpose (a stable per-install id for linking a
  purchase to `customerUserId`), unified here since one app targets both platforms.
- **Expo Go cannot run purchases** (see [Expo Go](#expo-go) above) - the only client-side
  constraint that doesn't exist on native iOS/Android at all.

---

## Threads / Concurrency

Everything here is `async`/`await` over `fetch` and `expo-iap`'s own async APIs - safe to
call from any context. There's no main-thread/actor constraint to worry about like the Swift SDK's
`@MainActor`, since JS has no cross-thread concerns of that kind.
