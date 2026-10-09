/**
 * Subscription AccS handling as a cart API middleware (not a block-level replace).
 */

import { events } from '@dropins/tools/event-bus.js';
import { getSelectionForCartItem } from '../selection-store.js';
import {
  addToCartWithSubscription,
  updateCartItemWithSubscription,
} from '../subscription-add-to-cart.js';

/**
 * @returns {number|string|undefined}
 */
function catalogProductIdFromPdp() {
  const product = events.lastPayload('pdp/data')
    ?? events.lastPayload('pdp/data', { scope: 'modal' })
    ?? null;
  return product?.externalId || product?.id;
}

/**
 * @param {{ sku?: string, parentSku?: string, uid?: string }} item
 */
function selectionForCartItem(item) {
  return getSelectionForCartItem({
    sku: item?.sku,
    topLevelSku: item?.parentSku,
    uid: item?.uid,
  }) || { purchaseType: 'one_time' };
}

/**
 * @returns {import('./cart-api-middleware.js').CartApiMiddleware}
 */
export function createSubscriptionCartMiddleware() {
  return {
    id: 'storefront-eds-subscription',

    async addProductsToCart(items, next) {
      if (!Array.isArray(items) || items.length !== 1) {
        return next(items);
      }

      const cartItem = items[0];
      return addToCartWithSubscription({
        cartItem,
        selection: selectionForCartItem(cartItem),
        catalogProductId: catalogProductIdFromPdp(),
        addProductsToCart: next,
      });
    },

    async updateProductsFromCart(items, next) {
      if (!Array.isArray(items) || items.length !== 1) {
        return next(items);
      }

      const cartItem = items[0];
      const itemUid = cartItem?.uid;
      if (!itemUid) {
        return next(items);
      }

      return updateCartItemWithSubscription({
        cartItem,
        itemUid,
        selection: selectionForCartItem(cartItem),
        catalogProductId: catalogProductIdFromPdp(),
        updateProductsFromCart: next,
      });
    },
  };
}
