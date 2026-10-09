/**
 * Thin Extend glue for Cart / Mini-cart blocks.
 * Owns subscription detail maps and paints Adobe CartSummary slots.
 */

import { appendCartProductAttributesSlot } from '../helpers/cart-product-attributes-slot.js';
import { createSubscriptionSummaryUpdater } from '../cart-order-summary.js';
import { fetchCheckoutConfig } from '../adapters/storefront-checkout-config-adapter.js';
import {
  applySubscriptionLinePrices,
  clearCartSubscriptionDetails,
  fetchCartItemSubscriptionDetails,
  renderCartSubscriptionDetails,
  syncCartSubscriptionDetails,
} from '../cart-subscription-details.js';

/**
 * @param {{
 *   getCartItems: () => Array<{ uid?: string }>,
 *   labels?: { payNow?: string, chargedFor?: string },
 *   showChargedFor?: boolean,
 * }} options
 */
export function createCartSubscriptionSession(options) {
  const {
    getCartItems,
    labels = {},
    showChargedFor = false,
  } = options;

  /** @type {Map<string, import('../cart-subscription-details.js').CartSubscriptionDetails>} */
  const detailsByUid = new Map();
  const priceSlotsByUid = new Map();
  const totalSlotsByUid = new Map();
  const rootsByUid = new Map();

  /** @type {Record<string, unknown>|null} */
  let checkoutConfig = null;
  let checkoutConfigCartId = null;

  const applyPrices = (uid, details, item) => {
    applySubscriptionLinePrices(
      priceSlotsByUid,
      totalSlotsByUid,
      uid,
      details,
      item,
    );
  };

  const buildSummaryUpdater = () => {
    const withSubscription = createSubscriptionSummaryUpdater({
      getItems: getCartItems,
      getDetailsByUid: () => detailsByUid,
      getConfig: () => checkoutConfig,
      labels,
      showChargedFor,
    });
    return (lineItems) => withSubscription(lineItems).filter((line) => (
      line.key !== 'shippingContent'
      && !(line.key === 'taxContent' && line.sortOrder < 900)
    ));
  };

  /**
   * Slot handlers for CartSummaryTable — merchant spreads into `slots: { ... }`.
   * @returns {Record<string, Function>}
   */
  const createSummarySlots = () => ({
    Price: (ctx) => {
      const { item } = ctx;
      const uid = item?.uid;
      if (!uid) return;
      priceSlotsByUid.set(uid, { ctx, item });
      applyPrices(uid, detailsByUid.get(uid), item);
    },

    Subtotal: (ctx) => {
      const { item } = ctx;
      const uid = item?.uid;
      if (!uid) return;
      totalSlotsByUid.set(uid, { ctx, item });
      applyPrices(uid, detailsByUid.get(uid), item);
    },

    Configurations: (ctx) => {
      const { item } = ctx;
      const uid = item?.uid;
      if (ctx.querySelector?.('.cart-subscription-details')) return;

      appendCartProductAttributesSlot(ctx, item, { format: 'cart' });

      const subscriptionRoot = document.createElement('div');
      subscriptionRoot.className = 'cart-subscription-details';
      ctx.appendChild(subscriptionRoot);
      if (uid) rootsByUid.set(uid, subscriptionRoot);

      const cachedDetails = uid ? detailsByUid.get(uid) : null;
      if (cachedDetails) {
        renderCartSubscriptionDetails(subscriptionRoot, cachedDetails);
        return;
      }

      const details = fetchCartItemSubscriptionDetails(item);
      if (details && uid) {
        detailsByUid.set(uid, details);
        renderCartSubscriptionDetails(subscriptionRoot, details);
        applyPrices(uid, details, item);
      } else {
        clearCartSubscriptionDetails(subscriptionRoot);
      }
    },
  });

  const refreshDetails = async (items) => {
    const next = await syncCartSubscriptionDetails(items, detailsByUid);
    detailsByUid.clear();
    next.forEach((details, uid) => {
      detailsByUid.set(uid, details);
      const item = (items || []).find((entry) => entry?.uid === uid);
      applyPrices(uid, details, item);
      const root = rootsByUid.get(uid);
      if (root) renderCartSubscriptionDetails(root, details);
    });
    rootsByUid.forEach((root, uid) => {
      if (!next.has(uid)) clearCartSubscriptionDetails(root);
    });
  };

  const refreshCheckoutConfig = async (cartData) => {
    const cartId = cartData?.id;
    if (!cartId || cartId === checkoutConfigCartId) return false;
    checkoutConfigCartId = cartId;
    checkoutConfig = await fetchCheckoutConfig(cartId);
    return true;
  };

  return {
    detailsByUid,
    createSummarySlots,
    buildSummaryUpdater,
    refreshDetails,
    refreshCheckoutConfig,
    getCheckoutConfig: () => checkoutConfig,
  };
}
