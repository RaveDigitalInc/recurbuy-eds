# `@recurbuy/storefront-eds`

RecurBuy subscription UI and AccS glue for **Adobe Commerce Storefront (EDS)**.

Adobe model ([Getting started](https://experienceleague.adobe.com/en/tools/commerce-storefront/get-started/)): merchant keeps Adobe PDP/Cart drop-ins; RecurBuy **extends** them. This package is the RecurBuy side.

**Status (branch `feature/recurbuy-npm-extend-glue`):** local `file:` package inside `recurbuy-eds`. Not published to npm registry yet. Merchant install today = copy package + thin block wiring (below).

---

## Architecture (how it works)

```
Shopper browser (EDS)
  │
  ├─ Adobe drop-ins (@dropins/storefront-pdp, storefront-cart, …)
  │     GraphQL → Adobe Commerce AccS
  │
  ├─ Merchant blocks (product-details, commerce-cart, …)
  │     thin glue only: mount roots + slots + call extend API
  │
  └─ @recurbuy/storefront-eds
        │
        ├─ UI: plan selector, price box, cart line details
        ├─ AccS price timing: POST pending-subscription-add  BEFORE  addProductsToCart
        ├─ Markers: setCustomAttributesOnCartItem AFTER add
        └─ HTTPS → RecurBuy panel  /api/recurbuy/storefront/*
                    (subscription-config, options-list, pending-add, …)
```

### Why AccS needs RecurBuy panel + pending-add

On Adobe Commerce as a Cloud Service:

1. `addProductsToCart` **cannot** carry `recurbuy_subscription_option_id` via `entered_options` (only real catalog option UIDs).
2. Price webhook `sales_quote_item_save_before` runs **during** Magento add — **before** cart item custom attributes exist.
3. Therefore EDS must call  
   `POST /api/recurbuy/storefront/checkout/pending-subscription-add`  
   **before** GraphQL add, so the panel’s quote-item-price webhook can apply plan %.
4. After add, EDS sets cart item custom attributes (`recurbuy_subscription_option_id`, …) for place-after profile create.

RecurBuy does **not** replace Adobe PDP/Cart. It only marks the line and prices via webhooks.

### Package layout

| Path | Role |
|------|------|
| `src/extend/product-details.js` | Merchant PDP glue API |
| `src/extend/cart.js` | Merchant Cart glue API |
| `src/extend/initializer.js` | Cart drop-in transformer (custom attributes) |
| `src/mount-pdp.js`, `subscription-*.js`, `adapters/*` | Internal implementation |
| `scripts/subscriptions/*` (repo shim) | Re-exports for older relative imports |

### Runtime config (browser)

Keys under `config.json` → `public.default`:

| Key | Meaning |
|-----|---------|
| `subscriptions-storefront-url` | RecurBuy panel base URL (no trailing slash) |
| `subscriptions-connection-token` | Connection public token (`Connection.token`) |
| `subscriptions-store-id` | Panel store id (`tenant_connection_stores.id`) |
| `subscriptions-website-id` | Optional |
| `subscriptions-timeout-ms` | Optional (default 30000) |

Do **not** commit real tokens. Keep local `config.json` gitignored; ship `config.example.json` only.

---

## Merchant install

### Prerequisites

1. Adobe Commerce Storefront boilerplate (EDS) with PDP + Cart drop-ins working.
2. RecurBuy panel: Connection for that Magento, store created, subscription options on products.
3. AccS webhooks pointed at the **public** panel URL (price / place-before / place-after). Local EDS can talk to `http://127.0.0.1:8080`; Magento AccS cannot — webhooks need HTTPS tunnel or staging.

### 1. Add the package

**Today (monorepo / copy):**

```bash
# option A — this repo already has:
#   packages/recurbuy-storefront
npm install file:packages/recurbuy-storefront

# option B — copy packages/recurbuy-storefront into merchant EDS repo
# then same npm install file:…
```

**Later (when published):**

```bash
npm install @recurbuy/storefront-eds
```

### 2. Import map (`head.html`)

```json
"@recurbuy/storefront-eds/": "/packages/recurbuy-storefront/src/",
"@recurbuy/storefront-eds": "/packages/recurbuy-storefront/src/index.js"
```

(Adjust path if the package lives under `node_modules` and you vendor/copy sources for EDS static serving.)

### 3. Config

```json
{
  "public": {
    "default": {
      "subscriptions-storefront-url": "https://<recurbuy-panel-host>",
      "subscriptions-connection-token": "<Connection.token>",
      "subscriptions-store-id": "<panel_store_id>"
    }
  }
}
```

Local panel example: `http://127.0.0.1:8080`. After changing config, clear `sessionStorage` key `config` (EDS caches config ~2h).

### 4. Cart initializer (required)

In `scripts/initializers/cart.js`, register the cart model transformer so GraphQL `custom_attributes` reach the drop-in:

```js
import { createCartModelCustomAttributesTransformer } from '../../packages/recurbuy-storefront/src/extend/initializer.js';
import { config, initialize, setFetchGraphQlHeaders } from '@dropins/storefront-cart/api.js';

// inside initialize mount:
models: {
  CartModel: {
    transformer: createCartModelCustomAttributesTransformer(config),
  },
},
```

### 5. Product details block (required)

1. Add DOM roots in the block layout (names can vary; pass the elements into the API):

   - subscription selector
   - subscription price
   - optional: subscription details
   - keep Adobe product price node if you hide it when a plan is selected

2. Glue:

```js
import {
  mountProductDetailsSubscription,
  submitProductDetailsCart,
} from '../../packages/recurbuy-storefront/src/extend/product-details.js';

const subscriptionController = mountProductDetailsSubscription({
  selectorRoot: $subscription,
  priceRoot: $subscriptionPrice,
  productPriceRoot: $price,
  detailsRoot: $subscriptionDetails,
  onChange: (_selection, meta) => {
    // disable Add to Cart when !meta.selectionValid || !meta.productValid
  },
});

// inside Add to Cart click (after pdpApi validation):
const result = await submitProductDetailsCart({
  values: pdpApi.getProductConfigurationValues(),
  selection: subscriptionController.getSelection(),
  productData: events.lastPayload('pdp/data'),
  mode: isUpdateMode ? 'update' : 'add',
  itemUid: itemUidFromUrl,
});
```

`submitProductDetailsCart` runs pending-add (if plan selected) → Magento add → cart item attributes.

### 6. Cart block (required)

```js
import { createCartSubscriptionSession } from '../../packages/recurbuy-storefront/src/extend/cart.js';
import * as Cart from '@dropins/storefront-cart/api.js';

const subscriptions = createCartSubscriptionSession({
  getCartItems: () => Cart.getCartDataFromCache()?.items || [],
  labels: {
    payNow: placeholders?.Global?.YouPayNow,
    chargedFor: placeholders?.Global?.YouWillBeChargedFor,
  },
});

provider.render(CartSummaryTable, {
  slots: {
    ...subscriptions.createSummarySlots(), // Price, Subtotal, Configurations
    // merchant Thumbnail / Actions stay here
  },
})($list);

provider.render(OrderSummary, {
  updateLineItems: subscriptions.buildSummaryUpdater(),
})($summary);

events.on('cart/data', async (cartData) => {
  await subscriptions.refreshDetails(cartData?.items);
  await subscriptions.refreshCheckoutConfig(cartData);
}, { eager: true });
```

### 7. Optional surfaces

| Surface | Status on this branch |
|---------|------------------------|
| Mini-cart | Still uses compatibility shims under `scripts/subscriptions` / helpers — same package under the hood |
| Checkout product attributes | Helper `appendCartProductAttributesSlot` |
| Checkout success profiles | Adapters in package (`fetchCheckoutSuccessProfiles`) — wire when needed |

---

## Merchant checklist

- [ ] Package present (`packages/recurbuy-storefront` or npm)
- [ ] Import map (if using `@recurbuy/…` aliases)
- [ ] `config.json` keys set; not committed with secrets
- [ ] Cart initializer transformer registered
- [ ] PDP: DOM roots + `mountProductDetailsSubscription` + `submitProductDetailsCart`
- [ ] Cart: `createCartSubscriptionSession` + summary slots + `cart/data` refresh
- [ ] Panel Connection + store + product subscription options
- [ ] AccS webhooks → **public** panel URL (price / place)
- [ ] Smoke: PDP plan → cart shows plan price → place creates profile

---

## What the merchant does **not** do

- Do not put RecurBuy ids in GraphQL `entered_options`.
- Do not fork Adobe drop-in packages to inject subscription logic.
- Do not expect `npm install` alone with zero block edits — EDS always needs block glue (same as Adobe drop-ins).

---

## Reference APIs (extend)

### `mountProductDetailsSubscription(options)`

Mounts selector + price + details. Returns controller with `getSelection()`, `isSelectionValid()`, …

### `submitProductDetailsCart({ values, selection, productData, mode, itemUid })`

Add or update cart with AccS-safe RecurBuy flow. Returns `{ ok, cartItem, productName }`.

### `createCartSubscriptionSession({ getCartItems, labels })`

Returns:

- `createSummarySlots()` → `{ Price, Subtotal, Configurations }`
- `buildSummaryUpdater()` for OrderSummary
- `refreshDetails(items)` / `refreshCheckoutConfig(cartData)`

### `createCartModelCustomAttributesTransformer(cartConfig)`

Cart initializer transformer for line `custom_attributes`.

---

## Related panel docs

- AccS add-to-cart contract: `docs/recurbuy/storefront-accs-drop-in-addtocart.md` (SaaS repo)
- Storefront HTTP API: `docs/recurbuy/storefront-api.md`
