/**
 * Extended `@dropins/storefront-cart/api.js` surface.
 *
 * Merchant blocks keep:
 *   import { addProductsToCart } from '@dropins/storefront-cart/api.js';
 *
 * Import map points that specifier here. Vendors register middleware via
 * `registerCartApiMiddleware` instead of changing block imports.
 */

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
} from '@dropins/storefront-cart-impl/api.js';
import {
  composeCartApiHandlers,
  getCartApiMiddlewares,
  registerCartApiMiddleware,
} from './cart-api-middleware.js';
import { createSubscriptionCartMiddleware } from './subscription-cart-middleware.js';

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
  registerCartApiMiddleware,
};

registerCartApiMiddleware(createSubscriptionCartMiddleware());

/**
 * @param {Array<Record<string, unknown>>} items
 */
export async function addProductsToCart(items) {
  const run = composeCartApiHandlers(
    getCartApiMiddlewares().map((middleware) => middleware.addProductsToCart),
    adobeAddProductsToCart,
  );
  return run(items);
}

/**
 * @param {Array<Record<string, unknown>>} items
 */
export async function updateProductsFromCart(items) {
  const run = composeCartApiHandlers(
    getCartApiMiddlewares().map((middleware) => middleware.updateProductsFromCart),
    adobeUpdateProductsFromCart,
  );
  return run(items);
}
