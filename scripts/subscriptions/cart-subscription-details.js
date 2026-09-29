import { formatMoney, formatPeriod } from './format.js';
import {
  getSelectionForCartItem,
  linkSelectionUid,
  pruneSelectionsToCartItems,
  saveSelectionForUid,
} from './selection-store.js';

/**
 * @typedef {import('./contract.js').CartSubscriptionDetails} CartSubscriptionDetails
 */

/**
 * Renders subscription details for a cart item.
 * @param {HTMLElement} root
 * @param {CartSubscriptionDetails|null|undefined} details
 */
export function renderCartSubscriptionDetails(root, details) {
  if (!root) return;

  root.className = 'cart-subscription-details';

  if (!details || details.purchaseType !== 'subscription') {
    clearCartSubscriptionDetails(root);
    return;
  }

  const {
    planLabel,
    period,
    price,
    startDate,
  } = details;
  const startLabel = formatStartDate(startDate);

  root.hidden = false;
  root.innerHTML = `
    <div class="cart-subscription-details__content">
      <span class="cart-subscription-details__badge">Subscription</span>
      <dl class="cart-subscription-details__list">
        ${planLabel ? `
          <div class="cart-subscription-details__row">
            <dt class="cart-subscription-details__label">Plan</dt>
            <dd class="cart-subscription-details__value">${escapeHtml(planLabel)}</dd>
          </div>
        ` : ''}
        ${period ? `
          <div class="cart-subscription-details__row">
            <dt class="cart-subscription-details__label">Frequency</dt>
            <dd class="cart-subscription-details__value">${escapeHtml(formatPeriod(period))}</dd>
          </div>
        ` : ''}
        ${price ? `
          <div class="cart-subscription-details__row">
            <dt class="cart-subscription-details__label">Subscription price</dt>
            <dd class="cart-subscription-details__value">${escapeHtml(formatMoney(price))}</dd>
          </div>
        ` : ''}
        ${startLabel ? `
          <div class="cart-subscription-details__row">
            <dt class="cart-subscription-details__label">First delivery</dt>
            <dd class="cart-subscription-details__value">${escapeHtml(startLabel)}</dd>
          </div>
        ` : ''}
      </dl>
    </div>
  `;
}

/**
 * @param {HTMLElement} root
 */
export function clearCartSubscriptionDetails(root) {
  if (!root) return;
  root.className = 'cart-subscription-details';
  root.hidden = true;
  root.innerHTML = '';
}

/**
 * Reads subscription details snapshot for a cart item from stored selection.
 * No gateway catalog lookup is performed. Returns null if snapshot is missing.
 *
 * @param {{
 *   uid?: string,
 *   sku?: string,
 *   topLevelSku?: string,
 *   customFields?: Record<string, unknown>,
 * }|null|undefined} item
 * @returns {Promise<CartSubscriptionDetails|null>}
 */
export async function fetchCartItemSubscriptionDetails(item) {
  if (!item) return null;

  const selection = getSelectionForCartItem(item);
  if (!selection || selection.purchaseType !== 'subscription' || !selection.planId) {
    return null;
  }

  if (item.uid) {
    saveSelectionForUid(item.uid, selection);
  }

  const snapshot = selection.planSnapshot;

  // Если snapshot отсутствует, возвращаем null (плашка подписки в корзине скрывается)
  if (!snapshot) {
    return null;
  }

  return {
    purchaseType: 'subscription',
    planId: selection.planId,
    planLabel: snapshot.planLabel || `Plan ${selection.planId}`,
    period: snapshot.period || { value: 1, unit: 'month' },
    price: snapshot.price || { value: 0, currency: 'USD' },
    startDate: snapshot.startDate,
  };
}

/**
 * Syncs local cart subscription state from cart events / cart data.
 * @param {Array<{
 *   uid?: string,
 *   sku?: string,
 *   topLevelSku?: string,
 *   customFields?: Record<string, unknown>,
 * }>|null|undefined} items
 * @param {Map<string, CartSubscriptionDetails>} detailsByUid
 * @returns {Promise<Map<string, CartSubscriptionDetails>>}
 */
export async function syncCartSubscriptionDetails(items, detailsByUid = new Map()) {
  const next = new Map(detailsByUid);
  const list = items || [];

  pruneSelectionsToCartItems(list);

  await Promise.all(list.map(async (item) => {
    if (!item?.uid) return;

    if (item.sku) {
      linkSelectionUid(item.sku, item.uid);
    }
    if (item.topLevelSku && item.topLevelSku !== item.sku) {
      linkSelectionUid(item.topLevelSku, item.uid);
    }

    const details = await fetchCartItemSubscriptionDetails(item);
    if (details) {
      next.set(item.uid, details);
    } else {
      next.delete(item.uid);
    }
  }));

  // Drop entries for removed items
  const liveUids = new Set(list.map((item) => item?.uid).filter(Boolean));
  [...next.keys()].forEach((uid) => {
    if (!liveUids.has(uid)) next.delete(uid);
  });

  return next;
}

/**
 * @param {string|undefined} startDate
 * @returns {string}
 */
function formatStartDate(startDate) {
  if (!startDate) return '';
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return startDate;

  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
  } catch {
    return startDate;
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}