/**
 * Thin Extend glue for the Product Details block.
 * Merchant keeps Adobe PDP containers and alerts; RecurBuy owns selector / price / AccS add.
 */

import { getSubscriptionOptionIdFromCartItem } from '../cart-line-custom-attributes.js';
import { CartPayloadAdapter } from '../cart-payload-adapter.js';
import { ensureRecurBuyStyles } from '../helpers/ensure-styles.js';
import { mountSubscriptionOnPdp } from '../mount-pdp.js';
import { getSelectionForCartItem } from '../selection-store.js';
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
 *   scope?: string,
 *   initialSelection?: import('../contract.js').SubscriptionSelection,
 *   onChange?: (selection: unknown, meta: {
 *     productValid: boolean,
 *     selectionValid: boolean,
 *   }) => void,
 * }} options
 * @returns {ReturnType<typeof mountSubscriptionOnPdp>}
 */
export function mountProductDetailsSubscription(options) {
  ensureRecurBuyStyles();
  return mountSubscriptionOnPdp(options);
}

/**
 * One call for merchant PDP / mini-PDP: mount UI + keep cart button validity in sync.
 *
 * @param {ProductDetailsSubscriptionRoots & {
 *   scope?: string,
 *   initialSelection?: import('../contract.js').SubscriptionSelection,
 *   getLoading?: () => boolean,
 * }} options
 */
export function attachPdpSubscription(options) {
  const { getLoading, ...mountOptions } = options;

  /** @type {{ setProps: Function }|null} */
  let buttonRef = null;
  /** @type {ReturnType<typeof mountSubscriptionOnPdp>|null} */
  let controller = null;

  const validity = createCartActionValidityBridge({
    getButton: () => buttonRef,
    getSubscriptionController: () => controller,
    getLoading: getLoading || (() => false),
  });

  controller = mountProductDetailsSubscription({
    ...mountOptions,
    onChange: validity.onSubscriptionChange,
  });

  return {
    getSelection: () => controller.getSelection(),
    isSelectionValid: () => controller.isSelectionValid(),
    onProductValid: validity.onProductValid,
    sync: validity.sync,
    /**
     * @param {{ setProps: Function }|null|undefined} button
     */
    bindCartButton(button) {
      buttonRef = button || null;
      validity.sync();
    },
  };
}

/**
 * Disable Add/Update cart button when PDP config or subscription selection is invalid.
 *
 * @param {{ setProps: Function }|null|undefined} button
 * @param {{
 *   productValid?: boolean,
 *   subscriptionController?: { isSelectionValid: () => boolean }|null,
 *   loading?: boolean,
 * }} [state]
 */
export function setCartActionDisabled(button, state = {}) {
  if (!button) return;
  const {
    productValid = true,
    subscriptionController = null,
    loading = false,
  } = state;
  const selectionValid = subscriptionController
    ? subscriptionController.isSelectionValid()
    : true;
  button.setProps((prev) => ({
    ...prev,
    disabled: loading || !productValid || !selectionValid,
  }));
}

/**
 * Keeps Add/Update button disabled state in sync with PDP + subscription validity.
 *
 * @param {{
 *   getSubscriptionController: () => { isSelectionValid: () => boolean }|null|undefined,
 *   getButton: () => { setProps: Function }|null|undefined,
 *   getLoading?: () => boolean,
 * }} options
 */
export function createCartActionValidityBridge(options) {
  const {
    getSubscriptionController,
    getButton,
    getLoading = () => false,
  } = options;

  let productValid = true;

  const sync = () => {
    setCartActionDisabled(getButton(), {
      productValid,
      subscriptionController: getSubscriptionController(),
      loading: getLoading(),
    });
  };

  return {
    getProductValid: () => productValid,
    sync,
    /** Pass to `mountProductDetailsSubscription({ onChange })`. */
    onSubscriptionChange: (_selection, meta) => {
      productValid = meta.productValid;
      sync();
    },
    /** Pass to `events.on('pdp/valid', …)`. */
    onProductValid: (valid) => {
      productValid = valid;
      sync();
    },
  };
}

/**
 * Initial PDP / mini-PDP selection from quote customFields (durable) or
 * same-document optimistic cache.
 *
 * @param {{
 *   uid?: string,
 *   sku?: string,
 *   topLevelSku?: string,
 *   customFields?: Record<string, unknown>,
 * }|null|undefined} cartItem
 * @returns {import('../contract.js').SubscriptionSelection}
 */
export function resolveCartItemInitialSelection(cartItem) {
  const optionIdFromQuote = getSubscriptionOptionIdFromCartItem(cartItem);
  if (optionIdFromQuote) {
    return {
      purchaseType: 'subscription',
      planId: optionIdFromQuote,
      subscriptionOptionId: optionIdFromQuote,
    };
  }

  return getSelectionForCartItem(cartItem) || { purchaseType: 'one_time' };
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

/**
 * PDP Add/Update path: validate config + subscription, then AccS submit.
 * Merchant block still owns redirect / InLineAlert.
 *
 * @param {{
 *   configurationValid: boolean,
 *   subscriptionController: {
 *     getSelection: () => import('../contract.js').SubscriptionSelection,
 *     isSelectionValid: () => boolean,
 *   },
 *   values: Record<string, unknown>|null|undefined,
 *   productData: { sku?: string, externalId?: string, name?: string }|null|undefined,
 *   mode: 'add'|'update',
 *   itemUid?: string|null,
 * }} input
 * @returns {Promise<{
 *   submitted: boolean,
 *   result?: Awaited<ReturnType<typeof submitProductDetailsCart>>,
 * }>}
 */
export async function submitProductDetailsCartIfValid(input) {
  const {
    configurationValid,
    subscriptionController,
    values,
    productData,
    mode,
    itemUid,
  } = input;

  if (!configurationValid || !subscriptionController.isSelectionValid()) {
    return { submitted: false };
  }

  const result = await submitProductDetailsCart({
    values: values || { sku: productData?.sku, quantity: 1 },
    selection: subscriptionController.getSelection(),
    productData,
    mode,
    itemUid,
  });

  return { submitted: true, result };
}

/**
 * Mini-PDP update path (modal): validate → AccS update → cart line payload.
 *
 * @param {{
 *   configurationValid: boolean,
 *   subscriptionController: {
 *     getSelection: () => import('../contract.js').SubscriptionSelection,
 *     isSelectionValid: () => boolean,
 *   },
 *   values: Record<string, unknown>|null|undefined,
 *   product: { sku?: string, externalId?: string, id?: string, name?: string },
 *   sku: string,
 *   cartItem: { uid?: string },
 * }} input
 * @returns {Promise<Record<string, unknown>>}
 */
export async function submitMiniPdpCartUpdate(input) {
  const {
    configurationValid,
    subscriptionController,
    values,
    product,
    sku,
    cartItem,
  } = input;

  if (!configurationValid || !subscriptionController.isSelectionValid()) {
    throw new Error('Please select all required options');
  }

  const { cartItem: updateData } = await submitProductDetailsCart({
    values,
    selection: subscriptionController.getSelection(),
    productData: {
      sku,
      externalId: product?.externalId || product?.id,
      name: product?.name,
    },
    mode: 'update',
    itemUid: cartItem.uid,
  });

  return updateData;
}

export { CartPayloadAdapter };
