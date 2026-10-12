/**
 * Thin Extend glue for Cart / Mini-cart blocks.
 * Owns subscription detail maps and paints Adobe CartSummary slots.
 */

import { getCartData } from '@dropins/storefront-cart/api.js';
import { appendCartProductAttributesSlot } from '../helpers/cart-product-attributes-slot.js';
import { hideAccsCartMergeOptionConfigurations } from '../helpers/hide-accs-merge-option.js';
import { ensureRecurBuyStyles } from '../helpers/ensure-styles.js';
import { createSubscriptionSummaryUpdater } from '../cart-order-summary.js';
import { fetchCheckoutConfig } from '../adapters/storefront-checkout-config-adapter.js';
import { nudgeQuantity } from '../cart-item-attributes.js';
import {
  applySubscriptionLinePrices,
  clearCartSubscriptionDetails,
  fetchCartItemSubscriptionDetails,
  paintMiniCartSubscriptionPrices,
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
  ensureRecurBuyStyles();

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
  /** @type {Set<string>} */
  const bundleRepriceAttempted = new Set();

  const applyPrices = (uid, details, item) => {
    applySubscriptionLinePrices(
      priceSlotsByUid,
      totalSlotsByUid,
      uid,
      details,
      item,
    );
  };

  const buildSummaryUpdater = () => createSubscriptionSummaryUpdater({
    getItems: getCartItems,
    getDetailsByUid: () => detailsByUid,
    getConfig: () => checkoutConfig,
    labels,
    showChargedFor,
  });

  /**
   * Append subscription details (+ optional custom attrs) into a cart/list slot.
   * @param {Object} ctx
   * @param {'cart'|'mini'} variant
   */
  const hideInternalCartMarks = () => {
    hideAccsCartMergeOptionConfigurations(document);
    requestAnimationFrame(() => hideAccsCartMergeOptionConfigurations(document));
  };

  const paintAttributesSlot = (ctx, variant = 'cart') => {
    const { item } = ctx;
    const uid = item?.uid;
    if (ctx.querySelector?.('.cart-subscription-details')) return;

    appendCartProductAttributesSlot(ctx, item, { format: 'cart' });
    hideInternalCartMarks();

    const subscriptionRoot = document.createElement('div');
    subscriptionRoot.className = variant === 'mini'
      ? 'cart-subscription-details cart-subscription-details--compact'
      : 'cart-subscription-details';
    ctx.appendChild(subscriptionRoot);
    if (uid) rootsByUid.set(uid, subscriptionRoot);

    const cachedDetails = uid ? detailsByUid.get(uid) : null;
    if (cachedDetails) {
      renderCartSubscriptionDetails(subscriptionRoot, cachedDetails, { variant });
      return;
    }

    const details = fetchCartItemSubscriptionDetails(item);
    if (details && uid) {
      detailsByUid.set(uid, details);
      renderCartSubscriptionDetails(subscriptionRoot, details, { variant });
      applyPrices(uid, details, item);
    } else {
      clearCartSubscriptionDetails(subscriptionRoot);
    }
  };

  /**
   * Slot handlers for CartSummaryList — merchant spreads into `slots: { ... }`.
   * @returns {Record<string, Function>}
   */
  const createSummarySlots = () => ({
    ItemPrice: (ctx) => {
      const { item } = ctx;
      const uid = item?.uid;
      if (!uid) return;
      priceSlotsByUid.set(uid, { ctx, item });
      applyPrices(uid, detailsByUid.get(uid), item);
    },

    ItemTotal: (ctx) => {
      const { item } = ctx;
      const uid = item?.uid;
      if (!uid) return;
      totalSlotsByUid.set(uid, { ctx, item });
      applyPrices(uid, detailsByUid.get(uid), item);
    },

    ProductAttributes: (ctx) => {
      paintAttributesSlot(ctx, 'cart');
    },
  });

  const paintMiniPrices = (items) => {
    const list = items || getCartItems() || [];
    const paint = () => paintMiniCartSubscriptionPrices(list, detailsByUid);
    paint();
    requestAnimationFrame(() => {
      paint();
      requestAnimationFrame(paint);
    });
  };

  /**
   * Slot handlers for MiniCart — merchant spreads into `slots: { ... }`.
   * @returns {Record<string, Function>}
   */
  const createMiniCartSlots = () => ({
    ItemPrice: () => {
      paintMiniPrices();
    },

    ItemTotal: () => {
      paintMiniPrices();
    },

    ProductAttributes: (ctx) => {
      paintAttributesSlot(ctx, 'mini');
      paintMiniPrices();
    },
  });

  const refreshDetails = async (items, refreshOptions = {}) => {
    const variant = refreshOptions.variant === 'mini' ? 'mini' : 'cart';
    let list = items || getCartItems() || [];
    let next = await syncCartSubscriptionDetails(list, detailsByUid);

    // One attempt per uid: force AccS to re-save bundle selections when GraphQL
    // still shows catalog/sale while stamped/synced plan unit is lower.
    const cartId = (await getCartData())?.id;
    if (cartId && typeof cartId === 'string') {
      let nudged = false;
      for (const [uid, details] of next.entries()) {
        if (bundleRepriceAttempted.has(uid)) continue;
        if (details?.purchaseType !== 'subscription') continue;
        const planValue = details.price?.value;
        if (!(typeof planValue === 'number' && planValue > 0)) continue;
        const item = list.find((entry) => entry?.uid === uid);
        if (!item || item.itemType !== 'BundleCartItem') continue;
        const magento = item.price?.value;
        if (!(typeof magento === 'number' && magento > planValue * 1.15)) continue;
        bundleRepriceAttempted.add(uid);
        const qty = Number(item.quantity) || 1;
        try {
          await nudgeQuantity(cartId, uid, qty + 1);
          await nudgeQuantity(cartId, uid, qty);
          nudged = true;
        } catch {
          // Display still uses stamped/synced plan unit.
        }
      }
      if (nudged) {
        list = getCartItems() || list;
        next = await syncCartSubscriptionDetails(list, detailsByUid);
      }
    }

    detailsByUid.clear();
    next.forEach((details, uid) => {
      detailsByUid.set(uid, details);
      const item = list.find((entry) => entry?.uid === uid);
      applyPrices(uid, details, item);
      const root = rootsByUid.get(uid);
      if (root) renderCartSubscriptionDetails(root, details, { variant });
    });
    rootsByUid.forEach((root, uid) => {
      if (!next.has(uid)) clearCartSubscriptionDetails(root);
    });
    if (variant === 'mini') {
      paintMiniPrices(list);
    }
    hideInternalCartMarks();
  };

  const refreshCheckoutConfig = async (cartData) => {
    const cartId = cartData?.id;
    if (!cartId || cartId === checkoutConfigCartId) return false;
    checkoutConfigCartId = cartId;
    checkoutConfig = await fetchCheckoutConfig(cartId);
    return true;
  };

  /**
   * Push a new `updateLineItems` identity so OrderSummary re-renders.
   * @param {{ setProps: Function }|null|undefined} orderSummary
   */
  const refreshOrderSummary = (orderSummary) => {
    orderSummary?.setProps((prev) => ({
      ...prev,
      updateLineItems: buildSummaryUpdater(),
    }));
  };

  /**
   * Cart / mini-cart `cart/data` handler: sync details (+ optional summary).
   *
   * @param {Object|null|undefined} cartData
   * @param {{
   *   variant?: 'cart'|'mini',
   *   orderSummary?: { setProps: Function }|null,
   * }} [syncOptions]
   */
  const syncFromCartData = async (cartData, syncOptions = {}) => {
    const variant = syncOptions.variant === 'mini' ? 'mini' : 'cart';
    try {
      await refreshDetails(cartData?.items, { variant });
    } catch (error) {
      console.error('Error syncing cart subscription details:', error);
    }

    if (variant === 'mini') return;

    try {
      const changed = await refreshCheckoutConfig(cartData);
      if (changed || syncOptions.orderSummary) {
        refreshOrderSummary(syncOptions.orderSummary);
      }
    } catch (error) {
      console.error('Error refreshing RecurBuy checkout config:', error);
    }
  };

  return {
    detailsByUid,
    createSummarySlots,
    createMiniCartSlots,
    buildSummaryUpdater,
    refreshDetails,
    paintMiniPrices,
    refreshCheckoutConfig,
    refreshOrderSummary,
    syncFromCartData,
    getCheckoutConfig: () => checkoutConfig,
  };
}

/**
 * Checkout CartSummaryList ProductAttributes slot — subscription line attrs only.
 * @returns {(ctx: Object) => void}
 */
export function createCheckoutProductAttributesSlot() {
  return (ctx) => {
    appendCartProductAttributesSlot(ctx, ctx.item, { format: 'cart' });
    hideAccsCartMergeOptionConfigurations(document);
    requestAnimationFrame(() => hideAccsCartMergeOptionConfigurations(document));
  };
}
