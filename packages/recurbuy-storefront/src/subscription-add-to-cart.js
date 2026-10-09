import {
  addProductsToCart as adobeAddProductsToCart,
  getCartData,
  createGuestCart,
  refreshCart,
  updateProductsFromCart as adobeUpdateProductsFromCart,
} from '@dropins/storefront-cart-impl/api.js';
import { postPendingSubscriptionAdd } from './adapters/storefront-pending-add-adapter.js';
import {
  findItemUid,
  setSubscriptionAttributes,
  nudgeQuantity,
} from './cart-item-attributes.js';
import { saveSelectionForSku, saveSelectionForUid } from './selection-store.js';

/**
 * AccS GraphQL: sales_quote_item_save_before runs on addProductsToCart
 * *before* setCustomAttributesOnCartItem. Pending-add is required so the
 * price webhook knows the option on first save. Attrs+nudge remain as backup.
 */
const USE_PENDING_SUBSCRIPTION_ADD = true;

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
async function registerPendingSubscription(cartId, sku, selection, catalogProductId, parentSku) {
  const subscriptionOptionId = resolveSubscriptionOptionId(selection);

  if (!USE_PENDING_SUBSCRIPTION_ADD) {
    return subscriptionOptionId;
  }

  if (!catalogProductId) {
    throw new Error('[RecurBuy] Missing catalogProductId required for pending subscription add.');
  }

  await postPendingSubscriptionAdd({
    cartId,
    sku,
    subscriptionOptionId,
    catalogProductId,
  });

  // AccS configurable: add may use parent SKU while save_before webhook sends child SKU.
  // Duplicate pending under parent so either key can be consumed (SaaS also indexes by product id).
  const normalizedParent = typeof parentSku === 'string' ? parentSku.trim() : '';
  if (normalizedParent && normalizedParent !== String(sku).trim()) {
    await postPendingSubscriptionAdd({
      cartId,
      sku: normalizedParent,
      subscriptionOptionId,
      catalogProductId,
    });
  }

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
  const snapshot = selection?.planSnapshot || {};
  const startDate = selection?.startDate
    || selection?.subscriptionStartDate
    || snapshot.startDate;

  await setSubscriptionAttributes(cartId, itemUid, subscriptionOptionId, {
    startDate,
    planLabel: snapshot.planLabel,
    period: snapshot.period,
    endsLabel: snapshot.endsLabel,
  });
  await nudgeQuantity(cartId, itemUid, quantity || 1);
}

/**
 * @param {Object} params
 * @param {Object} params.cartItem
 * @param {Object} [params.selection]
 * @param {number|string} [params.catalogProductId]
 * @param {(items: Array<Object>) => Promise<unknown>} [params.addProductsToCart]
 * @returns {Promise<Object>}
 */
export async function addToCartWithSubscription({
  cartItem,
  selection,
  catalogProductId,
  addProductsToCart: addFn = adobeAddProductsToCart,
}) {
  if (!isSubscriptionSelection(selection)) {
    return addFn([cartItem]);
  }

  const cartId = await resolveCartId();
  const cartBefore = await readCartQuietly();
  const subscriptionOptionId = await registerPendingSubscription(
    cartId,
    cartItem.sku,
    selection,
    catalogProductId,
    cartItem.parentSku,
  );

  const addResult = await addFn([cartItem]);
  let currentCart = addResult || (await getCartData());
  let itemUid = resolveAddedItemUid(cartBefore, currentCart, cartItem);

  if (!itemUid && typeof refreshCart === 'function') {
    currentCart = (await refreshCart()) || currentCart;
    itemUid = resolveAddedItemUid(cartBefore, currentCart, cartItem);
  }

  if (!itemUid) {
    throw new Error(`[RecurBuy] Added item UID not found in cart for SKU: ${cartItem.sku}`);
  }

  rememberResolvedLineSelection(currentCart, itemUid, selection);

  // Commerce merges a repeated SKU into the existing line. The PDP quantity is
  // only this add, so writing it back would reset a line of 2 to 1.
  await persistSubscriptionLine(
    cartId,
    itemUid,
    subscriptionOptionId,
    selection,
    quantityOnLine(currentCart, itemUid, cartItem.quantity),
  );

  if (typeof refreshCart === 'function') {
    const refreshed = await refreshCart();
    return refreshed || currentCart;
  }

  return currentCart;
}

/**
 * @returns {Promise<Object|null>}
 */
async function readCartQuietly() {
  try {
    return await getCartData();
  } catch {
    return null;
  }
}

/**
 * @param {Object|null|undefined} cart
 * @returns {Array<{ uid?: string, quantity?: number }>}
 */
function cartLines(cart) {
  const items = cart?.items || cart?.itemsV2?.items || [];
  return Array.isArray(items) ? items : [];
}

/**
 * Quote-item identity for this add.
 * A new variant is a new uid. The same variant is the line whose quantity grew.
 * Configurable children share the parent SKU, so the parent is not an identity.
 * Selected option UIDs are the variant key Magento stored on the line.
 *
 * @param {Object|null|undefined} beforeCart
 * @param {Object|null|undefined} afterCart
 * @param {{ sku?: string, optionsUIDs?: string[] }} [cartItem]
 * @returns {string|null}
 */
function resolveAddedItemUid(beforeCart, afterCart, cartItem) {
  const after = cartLines(afterCart).filter((item) => item?.uid);
  if (after.length === 0) return null;

  const beforeQty = new Map(
    cartLines(beforeCart)
      .filter((item) => item?.uid)
      .map((item) => [item.uid, Number(item.quantity) || 0]),
  );

  const delta = beforeQty.size === 0
    ? after
    : after.filter((item) => {
      if (!beforeQty.has(item.uid)) return true;
      return (Number(item.quantity) || 0) > beforeQty.get(item.uid);
    });

  if (delta.length === 0) return null;

  const requestedOptions = optionUidSet(cartItem?.optionsUIDs);
  if (requestedOptions.length > 0) {
    const byOptions = delta.filter((item) => sameOptionSet(
      optionUidSet(item.selectedOptionsUIDs),
      requestedOptions,
    ));
    if (byOptions.length === 1) return byOptions[0].uid;
    if (byOptions.length > 1) return null;
  }

  const requestedSku = typeof cartItem?.sku === 'string' ? cartItem.sku.trim().toLowerCase() : '';
  if (requestedSku) {
    const bySku = delta.filter((item) => {
      const own = typeof item.sku === 'string' ? item.sku.trim().toLowerCase() : '';
      return own !== '' && own === requestedSku;
    });
    if (bySku.length === 1) return bySku[0].uid;
  }

  return delta.length === 1 ? delta[0].uid : null;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function optionUidSet(value) {
  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (value && typeof value === 'object') {
    list = Object.values(value);
  }

  return list
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry !== '')
    .sort();
}

/**
 * @param {string[]} left
 * @param {string[]} right
 * @returns {boolean}
 */
function sameOptionSet(left, right) {
  return left.length > 0
    && left.length === right.length
    && left.every((uid, index) => uid === right[index]);
}

/**
 * Cart lines use the variant SKU. Persist the snapshot on that SKU and uid so a
 * later add of another child does not repaint this line with the new plan price.
 *
 * @param {Object|null|undefined} cart
 * @param {string} itemUid
 * @param {Object|null|undefined} selection
 */
function rememberResolvedLineSelection(cart, itemUid, selection) {
  if (!itemUid || !isSubscriptionSelection(selection)) return;

  const items = cart?.items || cart?.itemsV2?.items || [];
  const line = Array.isArray(items)
    ? items.find((item) => item?.uid === itemUid)
    : null;
  const lineSku = typeof line?.sku === 'string' ? line.sku.trim() : '';
  if (lineSku) {
    saveSelectionForSku(lineSku, selection);
  }
  saveSelectionForUid(itemUid, selection);
}

function quantityOnLine(cart, itemUid, fallback) {
  const items = cart?.items || cart?.itemsV2?.items || [];
  const line = Array.isArray(items)
    ? items.find((item) => item?.uid === itemUid)
    : null;
  const current = Number(line?.quantity);
  if (Number.isFinite(current) && current > 0) return current;

  const requested = Number(fallback);
  return Number.isFinite(requested) && requested > 0 ? requested : 1;
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
 * @param {(items: Array<Object>) => Promise<unknown>} [params.updateProductsFromCart]
 * @returns {Promise<Object>}
 */
export async function updateCartItemWithSubscription({
  cartItem,
  itemUid,
  selection,
  catalogProductId,
  updateProductsFromCart: updateFn = adobeUpdateProductsFromCart,
}) {
  const isSubscription = isSubscriptionSelection(selection);
  const cartId = isSubscription ? await resolveCartId() : null;
  const subscriptionOptionId = isSubscription
    ? await registerPendingSubscription(
      cartId,
      cartItem.sku,
      selection,
      catalogProductId,
      cartItem.parentSku,
    )
    : null;

  const updateResult = await updateFn([{
    ...cartItem,
    uid: itemUid,
    customFields: {},
  }]);

  if (isSubscription) {
    const updatedCart = updateResult || (await getCartData());
    const targetUid = findItemUid(updatedCart, cartItem.sku, cartItem.parentSku) || itemUid;
    rememberResolvedLineSelection(updatedCart, targetUid, selection);
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
