/**
 * Drop-in cart API surface with RecurBuy AccS subscription handling.
 *
 * Merchant blocks keep the original Adobe control flow:
 *   const { addProductsToCart } = await import('@recurbuy/storefront-eds/extend/cart-api.js');
 *   await addProductsToCart([{ ...values }]);
 *
 * When the PDP selector stored a plan for the SKU, pending-add + attrs run
 * automatically. One-time purchases pass through to Adobe unchanged.
 */

import { events } from '@dropins/tools/event-bus.js';
import {
  addProductsToCart as adobeAddProductsToCart,
  updateProductsFromCart as adobeUpdateProductsFromCart,
  ApplyCouponsStrategy,
  applyCouponsToCart,
  applyGiftCardToCart,
  config,
  createGuestCart,
  fetchGraphQl,
  getCartData,
  getCartDataFromCache,
  getConfig,
  getCountries,
  getCustomerCartPayload,
  getEstimateShipping,
  getEstimatedTotals,
  getGuestCartPayload,
  getRegions,
  getStoreConfig,
  initialize,
  initializeCart,
  publishShoppingCartViewEvent,
  refreshCart,
  removeFetchGraphQlHeader,
  removeGiftCardFromCart,
  resetCart,
  setEndpoint,
  setFetchGraphQlHeader,
  setFetchGraphQlHeaders,
  setGiftOptionsOnCart,
} from '@dropins/storefront-cart/api.js';
import { getSelectionForCartItem } from '../selection-store.js';
import {
  addToCartWithSubscription,
  updateCartItemWithSubscription,
} from '../subscription-add-to-cart.js';

export {
  ApplyCouponsStrategy,
  applyCouponsToCart,
  applyGiftCardToCart,
  config,
  createGuestCart,
  fetchGraphQl,
  getCartData,
  getCartDataFromCache,
  getConfig,
  getCountries,
  getCustomerCartPayload,
  getEstimateShipping,
  getEstimatedTotals,
  getGuestCartPayload,
  getRegions,
  getStoreConfig,
  initialize,
  initializeCart,
  publishShoppingCartViewEvent,
  refreshCart,
  removeFetchGraphQlHeader,
  removeGiftCardFromCart,
  resetCart,
  setEndpoint,
  setFetchGraphQlHeader,
  setFetchGraphQlHeaders,
  setGiftOptionsOnCart,
};

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
 * @param {Array<Record<string, unknown>>} items
 */
export async function addProductsToCart(items) {
  if (!Array.isArray(items) || items.length !== 1) {
    return adobeAddProductsToCart(items);
  }

  const cartItem = items[0];
  return addToCartWithSubscription({
    cartItem,
    selection: selectionForCartItem(cartItem),
    catalogProductId: catalogProductIdFromPdp(),
  });
}

/**
 * @param {Array<Record<string, unknown>>} items
 */
export async function updateProductsFromCart(items) {
  if (!Array.isArray(items) || items.length !== 1) {
    return adobeUpdateProductsFromCart(items);
  }

  const cartItem = items[0];
  const itemUid = cartItem?.uid;
  if (!itemUid) {
    return adobeUpdateProductsFromCart(items);
  }

  return updateCartItemWithSubscription({
    cartItem,
    itemUid,
    selection: selectionForCartItem(cartItem),
    catalogProductId: catalogProductIdFromPdp(),
  });
}
