/**
 * Client-side subscription selection store.
 * Used when Commerce cart GraphQL has not yet returned line custom attributes
 * (see cart-line-custom-attributes.js) or for plan snapshots before refresh.
 */

const STORAGE_KEY = 'recurbuy.subscription.selections';

/**
 * @typedef {import('./contract.js').SubscriptionSelection & {
 *   planSnapshot?: {
 *     planLabel?: string,
 *     period?: import('./contract.js').SubscriptionPeriod,
 *     price?: import('./contract.js').MoneyAmount,
 *     startDate?: string,
 *   }
 * }} SubscriptionSelection
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
  persistSelection('bySku', sku, selection);
}

/**
 * @param {string|undefined|null} uid
 * @param {SubscriptionSelection|null|undefined} selection
 */
export function saveSelectionForUid(uid, selection) {
  persistSelection('byUid', uid, selection);
}

/**
 * @param {'bySku'|'byUid'} bucket
 * @param {string|undefined|null} key
 * @param {SubscriptionSelection|null|undefined} selection
 */
function persistSelection(bucket, key, selection) {
  if (!key) return;

  const store = readStore();
  if (!selection || selection.purchaseType !== 'subscription' || !selection.planId) {
    delete store[bucket][key];
  } else {
    store[bucket][key] = {
      purchaseType: 'subscription',
      planId: selection.planId,
      customOptionValues: { ...(selection.customOptionValues || {}) },
      ...(selection.planSnapshot && { planSnapshot: { ...selection.planSnapshot } }),
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
  const existing = store.byUid[uid];
  if (
    existing
    && existing.purchaseType === 'subscription'
    && existing.planId
    && String(existing.planId) !== String(selection.planId)
  ) {
    return;
  }
  store.byUid[uid] = { ...selection };
  writeStore(store);
}

/**
 * @param {{
 *   uid?: string,
 *   sku?: string,
 *   topLevelSku?: string,
 * }|null|undefined} item
 * @returns {SubscriptionSelection|null}
 */
export function getSelectionForCartItem(item) {
  if (!item) return null;

  const store = readStore();
  if (item.uid && store.byUid[item.uid]) {
    return store.byUid[item.uid];
  }

  if (item.sku && store.bySku[item.sku]) {
    return store.bySku[item.sku];
  }

  // Configurable children share one parent SKU. That snapshot is whichever
  // variant was added last, so it must not paint the other lines.
  if (
    item.topLevelSku
    && (!item.sku || item.sku === item.topLevelSku)
    && store.bySku[item.topLevelSku]
  ) {
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
