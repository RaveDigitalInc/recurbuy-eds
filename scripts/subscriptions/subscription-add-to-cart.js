import {
  addProductsToCart,
  getCartData,
  createGuestCart,
  refreshCart,
  updateProductsFromCart,
} from '@dropins/storefront-cart/api.js';
import { postPendingSubscriptionAdd } from './adapters/storefront-pending-add-adapter.js';
import {
  findItemUid,
  setSubscriptionAttributes,
  nudgeQuantity,
} from './cart-item-attributes.js';

/**
 * PDP selection stores the RecurBuy option on `planId`.
 * Update flows also pass `subscriptionOptionId`.
 *
 * @param {Object|null|undefined} selection
 * @returns {string|number|undefined}
 */
function resolveSubscriptionOptionId(selection) {
  return selection?.subscriptionOptionId || selection?.optionId || selection?.planId;
}

/**
 * @param {Object|null|undefined} selection
 * @returns {boolean}
 */
function isSubscriptionSelection(selection) {
  const subscriptionOptionId = resolveSubscriptionOptionId(selection);
  return Boolean(subscriptionOptionId && Number(subscriptionOptionId) >= 1);
}

/**
 * Masked cart id for pending-add. Guest carts are not created until the first add,
 * and `createGuestCart` returns the id string, not a cart object.
 *
 * @returns {Promise<string>}
 */
export async function resolveCartId() {
  try {
    const cartData = await getCartData();
    if (cartData?.id) {
      return String(cartData.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/no cart id/i.test(message)) {
      throw error;
    }
  }

  const created = await createGuestCart();
  const cartId = typeof created === 'string' ? created : created?.id;
  if (!cartId) {
    throw new Error('[RecurBuy] Failed to obtain or create a valid cart ID.');
  }
  return String(cartId);
}

/**
 * @param {string} cartId
 * @param {string} sku
 * @param {Object} selection
 * @param {number|string} catalogProductId
 * @returns {Promise<string|number>}
 */
async function registerPendingSubscription(cartId, sku, selection, catalogProductId) {
  const subscriptionOptionId = resolveSubscriptionOptionId(selection);
  if (!catalogProductId) {
    throw new Error('[RecurBuy] Missing catalogProductId required for pending subscription add.');
  }

  await postPendingSubscriptionAdd({
    cartId,
    sku,
    subscriptionOptionId,
    catalogProductId,
  });

  return subscriptionOptionId;
}

/**
 * @param {string} cartId
 * @param {string} itemUid
 * @param {string|number} subscriptionOptionId
 * @param {Object} selection
 * @param {number} quantity
 */
async function persistSubscriptionLine(cartId, itemUid, subscriptionOptionId, selection, quantity) {
  const startDate = selection?.startDate || selection?.subscriptionStartDate;
  await setSubscriptionAttributes(cartId, itemUid, subscriptionOptionId, startDate);
  await nudgeQuantity(cartId, itemUid, quantity || 1);
}

/**
 * @param {Object} params
 * @param {Object} params.cartItem
 * @param {Object} [params.selection]
 * @param {number|string} [params.catalogProductId]
 * @returns {Promise<Object>}
 */
export async function addToCartWithSubscription({
  cartItem,
  selection,
  catalogProductId,
}) {
  if (!isSubscriptionSelection(selection)) {
    return addProductsToCart([cartItem]);
  }

  const cartId = await resolveCartId();
  const subscriptionOptionId = await registerPendingSubscription(
    cartId,
    cartItem.sku,
    selection,
    catalogProductId,
  );

  const addResult = await addProductsToCart([cartItem]);
  const currentCart = addResult || (await getCartData());
  const itemUid = findItemUid(currentCart, cartItem.sku);

  if (!itemUid) {
    throw new Error(`[RecurBuy] Added item UID not found in cart for SKU: ${cartItem.sku}`);
  }

  await persistSubscriptionLine(
    cartId,
    itemUid,
    subscriptionOptionId,
    selection,
    cartItem.quantity || 1,
  );

  if (typeof refreshCart === 'function') {
    await refreshCart();
  }

  return currentCart;
}

/**
 * Replaces a cart line, then writes subscription attributes when the selection is a plan.
 * Empty `customFields` forces the drop-in to replace the line instead of patching quantity.
 *
 * @param {Object} params
 * @param {Object} params.cartItem
 * @param {string} params.itemUid
 * @param {Object} [params.selection]
 * @param {number|string} [params.catalogProductId]
 * @returns {Promise<Object>}
 */
export async function updateCartItemWithSubscription({
  cartItem,
  itemUid,
  selection,
  catalogProductId,
}) {
  const isSubscription = isSubscriptionSelection(selection);
  const cartId = isSubscription ? await resolveCartId() : null;
  const subscriptionOptionId = isSubscription
    ? await registerPendingSubscription(cartId, cartItem.sku, selection, catalogProductId)
    : null;

  const updateResult = await updateProductsFromCart([{
    ...cartItem,
    uid: itemUid,
    customFields: {},
  }]);

  if (isSubscription) {
    const updatedCart = updateResult || (await getCartData());
    const targetUid = findItemUid(updatedCart, cartItem.sku) || itemUid;
    await persistSubscriptionLine(
      cartId,
      targetUid,
      subscriptionOptionId,
      selection,
      cartItem.quantity || 1,
    );
  }

  if (typeof refreshCart === 'function') {
    await refreshCart();
  }

  return updateResult;
}
