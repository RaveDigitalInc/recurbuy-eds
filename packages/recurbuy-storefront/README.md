# `@recurbuy/storefront-eds`

RecurBuy **subscription library** for Adobe Commerce Storefront (EDS).

Install as an npm package, import from merchant blocks / initializers, call APIs where subscriptions are used. The package does **not** remap, wrap, or replace `@dropins/*`.

```bash
npm install @recurbuy/storefront-eds
# today (monorepo / unpublished):
npm install file:packages/recurbuy-storefront
```

---

## Mental model

| Layer | Owns |
|-------|------|
| Adobe drop-ins | PDP, cart, GraphQL to AccS |
| Merchant EDS blocks | DOM roots, alerts, redirects, `events.on(…)` |
| **This package** | Plan UI, AccS pending-add, cart-item attrs, cart line paint |

```
Merchant block
  │  import { attachPdpSubscription, submitProductDetailsCartIfValid } from '@recurbuy/storefront-eds'
  │  import { addProductsToCart } from '@dropins/storefront-cart/api.js'   ← Adobe, untouched
  └─ @recurbuy/storefront-eds
        pending-add (only when plan selected) → Adobe add → setCustomAttributes
        HTTPS → RecurBuy panel /api/recurbuy/storefront/*
```

**No pending-add ⇒ price webhook treats the line as one-time / catalog.**

AccS has no before-add event hook. Pending-add must run via an explicit library call on Add/Update (not an import-map intercept).

---

## Install in an EDS storefront

### 1. Dependency

```bash
npm install @recurbuy/storefront-eds
# or: npm install file:./vendor/recurbuy-storefront
```

Peer deps (already in Adobe boilerplate): `@dropins/storefront-cart`, `@dropins/storefront-pdp`, `@dropins/tools`.

### 2. Import map (`head.html`)

EDS serves ESM from the site root. Map the package to its **served** location (no Adobe remaps):

```json
/* published npm / node_modules */
"@recurbuy/storefront-eds/": "/node_modules/@recurbuy/storefront-eds/",
"@recurbuy/storefront-eds": "/node_modules/@recurbuy/storefront-eds/src/index.js"

/* this monorepo (file: package) */
"@recurbuy/storefront-eds/": "/packages/recurbuy-storefront/",
"@recurbuy/storefront-eds": "/packages/recurbuy-storefront/src/index.js"
```

### 3. Config (`config.json` → `public.default`)

| Key | Required | Meaning |
|-----|----------|---------|
| `subscriptions-storefront-url` | yes | RecurBuy panel base URL |
| `subscriptions-connection-token` | yes | `Connection.token` |
| `subscriptions-store-id` | yes | Panel store id |
| `subscriptions-website-id` | no | |
| `subscriptions-timeout-ms` | no | default `30000` |

Do not commit real tokens.

### 4. Wire call sites (thin glue)

**Cart initializer** — so GraphQL `custom_attributes` reach the drop-in:

```js
import { createCartModelCustomAttributesTransformer } from '@recurbuy/storefront-eds';
// or: …/extend/initializer.js

models: {
  CartModel: {
    transformer: createCartModelCustomAttributesTransformer(config),
  },
},
```

**PDP** — mount UI + call library on Add/Update:

```js
import {
  attachPdpSubscription,
  submitProductDetailsCartIfValid,
} from '@recurbuy/storefront-eds';

const pdpSubscription = attachPdpSubscription({
  selectorRoot: $subscription,
  priceRoot: $subscriptionPrice,
  productPriceRoot: $price,
  detailsRoot: $subscriptionDetails,
});

pdpSubscription.bindCartButton(addToCart);
events.on('pdp/valid', pdpSubscription.onProductValid, { eager: true });

const { submitted } = await submitProductDetailsCartIfValid({
  configurationValid: pdpApi.isProductConfigurationValid(),
  subscriptionController: pdpSubscription,
  values: pdpApi.getProductConfigurationValues(),
  productData: events.lastPayload('pdp/data'),
  mode: isUpdateMode ? 'update' : 'add',
  itemUid,
});
```

**Cart / mini-cart** — slots + Adobe `cart/data`:

```js
import { createCartSubscriptionSession } from '@recurbuy/storefront-eds';
import * as Cart from '@dropins/storefront-cart/api.js';

const subscriptions = createCartSubscriptionSession({
  getCartItems: () => Cart.getCartDataFromCache()?.items || [],
  labels: { /* … */ },
});

provider.render(CartSummaryList, {
  slots: { ...subscriptions.createSummarySlots() },
})($list);

events.on('cart/data', (cartData) => subscriptions.syncFromCartData(cartData), { eager: true });
```

Also keep Adobe’s official `overrideGQLOperations` fragment for cart `custom_attributes` in the storefront `build.mjs` (host build tool — not this package).

---

## Public API

Prefer the **package root** (`@recurbuy/storefront-eds`). Subpaths under `./extend/*` are stable aliases for the same modules.

| Export | Role |
|--------|------|
| `attachPdpSubscription` / `mountProductDetailsSubscription` | Mount plan UI on PDP / mini-PDP |
| `submitProductDetailsCartIfValid` / `submitProductDetailsCart` | AccS-safe add/update |
| `submitMiniPdpCartUpdate` | Mini-PDP update |
| `addToCartWithSubscription` / `updateCartItemWithSubscription` | Lower-level AccS helpers |
| `createCartSubscriptionSession` | Cart / mini-cart slots + refresh |
| `createCheckoutProductAttributesSlot` | Checkout line attrs |
| `createCartModelCustomAttributesTransformer` | Cart drop-in transformer |
| `getValidSubscriptionConfig` / config getters | Read EDS config keys |
| `getShopperAuthToken` | AccS customer JWT cookie (optional Bearer) |

Internals under `src/adapters/*`, `src/mount-pdp.js`, etc. are not a stability contract.

---

## Library rules (do / don’t)

| Do | Don’t |
|----|--------|
| `npm install` + import + call | Remap `@dropins/storefront-cart/api.js` to this package |
| Keep Adobe cart/PDP imports as Adobe ships them | Relative-import host `scripts/` from this package |
| Listen to Adobe `events` for UI refresh | Fork Adobe drop-in packages for RecurBuy |
| Call submit helpers only where Add/Update runs | Expect zero block edits |

This package is **self-contained**: no imports of the merchant repo (`scripts/`, `blocks/`). It only depends on peer `@dropins/*` and the browser.

---

## AccS pricing (why pending-add)

1. GraphQL `addProductsToCart` cannot carry RecurBuy option ids in `entered_options`.
2. Magento `sales_quote_item_save_before` runs **during** add — before cart item custom attributes exist.
3. Library posts `POST …/pending-subscription-add` **before** Adobe add when a plan is selected.
4. After add, library sets cart item custom attributes for place-after + cart UI.

---

## Merchant checklist

- [ ] `npm install` / `file:` dependency
- [ ] Import map → package root (not Adobe remaps)
- [ ] Config keys set
- [ ] Cart initializer transformer
- [ ] PDP: roots + `attachPdpSubscription` + submit helper
- [ ] Cart: `createCartSubscriptionSession` + `cart/data`
- [ ] Panel Connection + AccS webhooks (public URL)
- [ ] Smoke: plan add → plan price in cart → one-time same SKU stays catalog

---

## Related panel docs (SaaS repo)

- AccS add-to-cart: `docs/recurbuy/storefront-accs-drop-in-addtocart.md`
- Storefront HTTP API: `docs/recurbuy/storefront-api.md`
