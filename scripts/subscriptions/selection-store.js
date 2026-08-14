/**
 * Client-side subscription selection store.
 * Used until Commerce cart GraphQL returns subscription fields.
 */

import { SUBSCRIPTION_CUSTOM_FIELD_KEY } from './contract.js';

const STORAGE_KEY = 'recurbuy.subscription.selections';

/**
 * @typedef {import('./contract.js').SubscriptionSelection} SubscriptionSelection
 */

/**
 * @returns {{
 *   bySku: Record<string, SubscriptionSelection>,
 *   byUid: Record<string, SubscriptionSelection>,
 * }}
 */
function readStore() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { bySku: {}, byUid: {} };
    const parsed = JSON.parse(raw);
    return {
      bySku: parsed?.bySku && typeof parsed.bySku === 'object' ? parsed.bySku : {},
      byUid: parsed?.byUid && typeof parsed.byUid === 'object' ? parsed.byUid : {},
    };
  } catch {
    return { bySku: {}, byUid: {} };
  }
}

/**
 * @param {{
 *   bySku: Record<string, SubscriptionSelection>,
 *   byUid: Record<string, SubscriptionSelection>,
 * }} store
 */
function writeStore(store) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / private mode failures; cart will simply hide subscription details.
  }
}

/**
 * @param {string|undefined|null} sku
 * @param {SubscriptionSelection|null|undefined} selection
 */
export function saveSelectionForSku(sku, selection) {
  if (!sku) return;

  const store = readStore();
  if (!selection || selection.purchaseType !== 'subscription' || !selection.planId) {
    delete store.bySku[sku];
  } else {
    store.bySku[sku] = {
      purchaseType: 'subscription',
      planId: selection.planId,
      customOptionValues: { ...(selection.customOptionValues || {}) },
    };
  }
  writeStore(store);
}

/**
 * @param {string|undefined|null} uid
 * @param {SubscriptionSelection|null|undefined} selection
 */
export function saveSelectionForUid(uid, selection) {
  if (!uid) return;

  const store = readStore();
  if (!selection || selection.purchaseType !== 'subscription' || !selection.planId) {
    delete store.byUid[uid];
  } else {
    store.byUid[uid] = {
      purchaseType: 'subscription',
      planId: selection.planId,
      customOptionValues: { ...(selection.customOptionValues || {}) },
    };
  }
  writeStore(store);
}

/**
 * @param {string|undefined|null} sku
 * @param {string|undefined|null} uid
 */
export function linkSelectionUid(sku, uid) {
  if (!sku || !uid) return;
  const store = readStore();
  const selection = store.bySku[sku];
  if (!selection || selection.purchaseType !== 'subscription') return;
  store.byUid[uid] = { ...selection };
  writeStore(store);
}

/**
 * @param {{
 *   uid?: string,
 *   sku?: string,
 *   topLevelSku?: string,
 *   customFields?: Record<string, unknown>,
 * }|null|undefined} item
 * @returns {SubscriptionSelection|null}
 */
export function getSelectionForCartItem(item) {
  if (!item) return null;

  const fromFields = parseSelectionFromCustomFields(item.customFields);
  if (fromFields) return fromFields;

  const store = readStore();
  if (item.uid && store.byUid[item.uid]) {
    return store.byUid[item.uid];
  }

  if (item.sku && store.bySku[item.sku]) {
    return store.bySku[item.sku];
  }

  if (item.topLevelSku && store.bySku[item.topLevelSku]) {
    return store.bySku[item.topLevelSku];
  }

  return null;
}

/**
 * Drop selections for cart item UIDs that are no longer in the cart.
 * @param {Array<{ uid?: string }>|null|undefined} items
 */
export function pruneSelectionsToCartItems(items) {
  const store = readStore();
  const liveUids = new Set((items || []).map((item) => item?.uid).filter(Boolean));
  let changed = false;

  Object.keys(store.byUid).forEach((uid) => {
    if (!liveUids.has(uid)) {
      delete store.byUid[uid];
      changed = true;
    }
  });

  if (changed) writeStore(store);
}

/**
 * @param {Record<string, unknown>|undefined|null} customFields
 * @returns {SubscriptionSelection|null}
 */
function parseSelectionFromCustomFields(customFields) {
  const subscription = customFields?.[SUBSCRIPTION_CUSTOM_FIELD_KEY];
  if (!subscription || typeof subscription !== 'object') return null;

  const payload = /** @type {Record<string, unknown>} */ (subscription);
  if (payload.purchaseType !== 'subscription') return null;

  return {
    purchaseType: 'subscription',
    planId: typeof payload.planId === 'string' ? payload.planId : undefined,
    customOptionValues: /** @type {Record<string, string>|undefined} */ (
      payload.customOptionValues
    ),
  };
}
