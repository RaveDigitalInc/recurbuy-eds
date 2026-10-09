/**
 * Thin Extend glue for the Product Details block.
 * Merchant keeps Adobe PDP containers; RecurBuy owns selector / price / add path.
 */

import { CartPayloadAdapter } from '../cart-payload-adapter.js';
import { mountSubscriptionOnPdp } from '../mount-pdp.js';
import {
  addToCartWithSubscription,
  updateCartItemWithSubscription,
} from '../subscription-add-to-cart.js';

/**
 * @typedef {Object} ProductDetailsSubscriptionRoots
 * @property {HTMLElement} selectorRoot
 * @property {HTMLElement} priceRoot
 * @property {HTMLElement} [productPriceRoot]
 * @property {HTMLElement} [detailsRoot]
 */

/**
 * Mount RecurBuy subscription UI into merchant-provided DOM roots.
 *
 * @param {ProductDetailsSubscriptionRoots & {
 *   onChange?: (selection: unknown, meta: {
 *     productValid: boolean,
 *     selectionValid: boolean,
 *   }) => void,
 * }} options
 * @returns {ReturnType<typeof mountSubscriptionOnPdp>}
 */
export function mountProductDetailsSubscription(options) {
  return mountSubscriptionOnPdp(options);
}

/**
 * Build the AccS cart line + run pending-add / attributes add or update.
 *
 * @param {{
 *   values: Record<string, unknown>|null|undefined,
 *   selection: import('../contract.js').SubscriptionSelection|null|undefined,
 *   productData: { sku?: string, externalId?: string, name?: string }|null|undefined,
 *   mode: 'add'|'update',
 *   itemUid?: string|null,
 * }} input
 * @returns {Promise<{ ok: boolean, cartItem: Record<string, unknown>, productName: string }>}
 */
export async function submitProductDetailsCart(input) {
  const {
    values,
    selection,
    productData,
    mode,
    itemUid,
  } = input;

  const catalogProductId = productData?.externalId;
  const cartItem = CartPayloadAdapter.enrich(
    values || { sku: productData?.sku, quantity: 1 },
    selection,
    {
      parentSku: productData?.sku,
      selectedPlan: selection?.selectedPlan,
    },
  );

  if (mode === 'update') {
    await updateCartItemWithSubscription({
      cartItem,
      itemUid,
      selection,
      catalogProductId,
    });
    return {
      ok: true,
      cartItem,
      productName: productData?.name || 'This product',
    };
  }

  const added = await addToCartWithSubscription({
    cartItem,
    selection,
    catalogProductId,
  });

  return {
    ok: Boolean(added),
    cartItem,
    productName: productData?.name || 'This product',
  };
}

export { CartPayloadAdapter };
