# react-miamore

React SDK for the MiaMore backend: paywalls, subscription status, purchase linking, attribution
and app-open tracking. Its only peer dependency is `react`, so it runs in React Native (Expo or
bare) and in the browser.

The SDK only talks to the MiaMore backend (`/v1/sdk/*`). Store purchases (StoreKit / Play Billing),
persistent ids and app-lifecycle events are the host app's job: buy with your store library, then
hand the result to `link`.

> One SDK is shared across apps. Each app uses its own `bundleId` and `apiKey` from AdminJS.

---

## Installation

Not published to npm. Install from GitHub, pinned to a tag:

```bash
npm install github:mkryshtapovich/react-miamore#v0.2.0
```

---

## Setup

Wrap the app in `MiaMoreProvider`. The client is created from `config`. Pass `null` until the ids
are known; `useMiaMore()` returns `null` until then.

```tsx
import { MiaMoreProvider, type MiaMoreConfig } from 'react-miamore';

const [config, setConfig] = useState<MiaMoreConfig | null>(null);

useEffect(() => {
  loadIds().then(({ customerUserId, accountId }) =>
    setConfig({
      baseUrl: 'https://<your-sdk-service>',
      bundleId: 'com.example.app',
      apiKey: '<sdk_api_key from AdminJS>',
      customerUserId,
      accountId,
      environment: 'PROD',
    }),
  );
}, []);

return <MiaMoreProvider config={config}>{children}</MiaMoreProvider>;
```

| Param | Notes |
|---|---|
| `baseUrl` | SDK service base URL. A trailing slash is fine. |
| `bundleId` | iOS bundle id / Android package name / web app key. Must match `apps/{bundleId}` in Firestore. |
| `apiKey` | Per-app SDK API key from AdminJS. It ships inside the app, so treat it as public. |
| `customerUserId` | The id entitlements are keyed by (e.g. the AppsFlyer id). Keep it stable: purchases are linked to it. |
| `accountId` | Stable per-install id sent with links: StoreKit's `appAccountToken` / Play Billing's `obfuscatedAccountId`. The host creates and persists it. Pass the same value to your store library when buying. |
| `environment` | `'PROD'` (default) or `'SANDBOX'`. |

Keep the `config` object stable (state or `useMemo`): a new object creates a new client.

The client is read with the hook:

```ts
import { useMiaMore } from 'react-miamore';

const client = useMiaMore();
```

---

## Paywalls

```ts
const { paywall, assignment } = await client.getPaywall({ placement: 'main' });

paywall.products.forEach((p) => console.log(p.productId, p.billingPlanType, p.offerToken));
```

Also by id: `getPaywall({ paywallId })` / `getPaywall({ experimentId })`.

A product can appear more than once with different `billingPlanType` values (Apple: `up_front` /
`monthly` with a 12-month commitment) and/or carry an `offerToken` (Google Play base plan/offer).
Prices and trials come from your store library.

---

## Subscription status

```ts
const status = await client.getSubscriptionStatus();

if (status.isActive) {
  // unlock
}
```

Any other `customerUserId` (e.g. other installs of the same account, or a web purchase id from a
deep link):

```ts
const other = await client.getSubscriptionStatus({ customerUserId: 'ctm_…' });
```

A user with no linked purchase (`404 {"error":"not_linked"}`) gets an inactive status, not an
error. Unlock from `status.isActive`; `status.source` is `'app_store'`, `'android'`, `'web'`, or
`null`/`'unknown'`. `status.customerEmail` is the payer email when known.

---

## Purchases and linking

Buy with your store library (e.g. `expo-iap`), passing `config.accountId` as `appAccountToken`
(iOS) / `obfuscatedAccountId` (Android). Finish the transaction, then link it so
`getSubscriptionStatus` can find it:

```ts
// iOS
await client.link({ kind: 'apple', originalTransactionId });

// Android
await client.link({ kind: 'android', purchaseToken, productId });
```

Linking the same purchase again is safe. Link restored purchases too.

---

## Attribution

```ts
await client.updateAttribution({ appsflyerId });
await client.updateAttribution({ payload: conversionData });
```

---

## App opens

The SDK doesn't send app-open events on its own. Call `trackAppOpen()` at launch and whenever the app
returns to the foreground:

```ts
useEffect(() => {
  if (!client) return;

  const track = () => client.trackAppOpen().catch(() => {});

  track();

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') track();
  });

  return () => subscription.remove();
}, [client]);
```

This uses React Native's `AppState`. On the web, use the same pattern with `document`'s
`visibilitychange` event.

Each client sends at most one event per 30 minutes (kept in memory); a failed send is retried on the
next call.

---

## Errors

Failed calls throw an `Error` with:

- `type: 'http_error'` and `status`, `body` — the backend answered with a non-2xx status
- `type: 'invalid_response'` — the body was not JSON

`message` is human-readable. Network failures reject with the `fetch` error. There are no timeouts
or retries; wrap calls if you need them.

---

## Web

Works in the browser as is (React + `fetch` only):

- `provider.tsx` starts with `'use client'`, so it works in the Next.js App Router.
- The host supplies `customerUserId` and `accountId`, e.g. `crypto.randomUUID()` stored in
  `localStorage`.
- `link` is for App Store / Google Play purchases only. Web purchases reach MiaMore through the
  payment provider's webhooks.
- The backend must allow CORS for the site's origin (requests carry an `Authorization` header).
- The SDK API key is visible in the page bundle.
