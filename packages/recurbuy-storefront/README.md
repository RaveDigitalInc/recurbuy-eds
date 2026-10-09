# `@recurbuy/storefront-eds`

RecurBuy subscription UI + AccS glue for Adobe Commerce Storefront (EDS).

Adobe model: keep PDP/Cart drop-ins; **extend** via slots/events. This package is the RecurBuy side. Merchant blocks stay thin.

## Install (local / monorepo)

```bash
npm install file:packages/recurbuy-storefront
```

Import map (`head.html`):

```json
"@recurbuy/storefront-eds/": "/packages/recurbuy-storefront/src/"
```

## Config (`config.json`)

```json
{
  "public": {
    "default": {
      "subscriptions-storefront-url": "http://127.0.0.1:8080",
      "subscriptions-connection-token": "<Connection.token>",
      "subscriptions-store-id": "<panel store id>"
    }
  }
}
```

## Merchant glue

### Cart initializer

```js
import { createCartModelCustomAttributesTransformer } from '@recurbuy/storefront-eds/extend/initializer.js';
```

### Product details block

```js
import {
  mountProductDetailsSubscription,
  submitProductDetailsCart,
} from '@recurbuy/storefront-eds/extend/product-details.js';
```

### Cart block

```js
import { createCartSubscriptionSession } from '@recurbuy/storefront-eds/extend/cart.js';
```

See `src/extend/*` for the full API surface.
