import { fetchCheckoutCartItemFlags } from './adapters/storefront-cart-items-adapter.js';
import { fetchSubscriptionOptionList } from './adapters/storefront-options-list.js';
import {
  isPlaceholderPlanLabel,
  matchStorefrontCartItemFlagsRow,
  mergeCartSubscriptionDetailsWithFlags,
} from './adapters/storefront-cart-items-mapper.js';
import { formatBillingCycle, formatMoney } from './format.js';
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
export function renderCartSubscriptionDetails(root, details, options = {}) {
  if (!root) return;

  const variant = options.variant === 'mini' ? 'mini' : 'cart';
  root.className = variant === 'mini'
    ? 'cart-subscription-details cart-subscription-details--compact'
    : 'cart-subscription-details';

  if (!details || details.purchaseType !== 'subscription') {
    clearCartSubscriptionDetails(root);
    return;
  }

  const facts = renderSubscriptionFacts(details, { includePlan: variant === 'mini' });
  root.hidden = false;
  root.innerHTML = variant === 'mini'
    ? `
      <div class="cart-subscription-details__content">
        <span class="cart-subscription-details__badge">Subscription</span>
        <details class="cart-subscription-details__disclosure">
          <summary class="cart-subscription-details__summary">See Details</summary>
          ${facts}
        </details>
      </div>
    `
    : `
      <div class="cart-subscription-details__content">
        ${facts}
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
 * Returns null when the session snapshot has no plan.
 *
 * @param {{
 *   uid?: string,
 *   sku?: string,
 *   topLevelSku?: string,
 *   customFields?: Record<string, unknown>,
 * }|null|undefined} item
 * @returns {CartSubscriptionDetails|null}
 */
export function fetchCartItemSubscriptionDetails(item) {
  if (!item) return null;

  const selection = getSelectionForCartItem(item);
  if (!selection || selection.purchaseType !== 'subscription' || !selection.planId) {
    return null;
  }

  if (item.uid) {
    saveSelectionForUid(item.uid, selection);
  }

  const snapshot = selection.planSnapshot;
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

  const flagsRows = await loadCheckoutCartItemFlags();

  await Promise.all(list.map(async (item) => {
    if (!item?.uid) return;

    if (item.sku) {
      linkSelectionUid(item.sku, item.uid);
    }
    if (item.topLevelSku && item.topLevelSku !== item.sku) {
      linkSelectionUid(item.topLevelSku, item.uid);
    }

    const snapshotDetails = fetchCartItemSubscriptionDetails(item);
    const flagsRow = matchStorefrontCartItemFlagsRow(item, flagsRows);
    const currencyFallback = item?.price?.currency || item?.regularPrice?.currency || 'USD';
    const details = await withStorefrontPlanTitle(
      mergeCartSubscriptionDetailsWithFlags(
        snapshotDetails,
        flagsRow,
        currencyFallback,
      ),
      flagsRow,
    );

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
 * Cart flags do not include the plan title. The options-list HTML does,
 * keyed by the same subscription option id, when the quote line has product_id.
 *
 * @param {CartSubscriptionDetails|null} details
 * @param {Record<string, unknown>|null|undefined} flagsRow
 * @returns {Promise<CartSubscriptionDetails|null>}
 */
async function withStorefrontPlanTitle(details, flagsRow) {
  if (!details || !isPlaceholderPlanLabel(details.planLabel)) return details;

  const productId = flagsRow?.product_id;
  if (productId === null || productId === undefined || productId === '') return details;

  const optionList = await fetchSubscriptionOptionList(productId);
  const title = optionList?.titles?.[String(details.planId)];
  if (!title) return details;

  return { ...details, planLabel: title };
}

/**
 * @returns {Promise<Array<Record<string, unknown>>|null>}
 */
async function loadCheckoutCartItemFlags() {
  const cartId = await resolveCommerceCartId();
  if (!cartId) {
    return null;
  }

  return fetchCheckoutCartItemFlags(cartId);
}

/**
 * @returns {Promise<string|null>}
 */
async function resolveCommerceCartId() {
  try {
    const cartApi = await import('@dropins/storefront-cart/api.js');
    const cachedCart = cartApi.getCartDataFromCache?.();
    const cartId = cartApi.config?.cartId || cachedCart?.id;
    return typeof cartId === 'string' && cartId.trim() ? cartId.trim() : null;
  } catch {
    return null;
  }
}

/**
 * @param {CartSubscriptionDetails} details
 * @param {{ includePlan?: boolean }} [options]
 * @returns {string}
 */
function renderSubscriptionFacts(details, options = {}) {
  const cycle = formatBillingCycle(details.period);
  const amount = details.price ? formatMoney(details.price) : '';
  const payment = amount && cycle ? `${amount} / ${cycle}` : amount;
  const startLabel = formatStartDate(details.startDate);
  const planLabel = options.includePlan && !isPlaceholderPlanLabel(details.planLabel)
    ? details.planLabel
    : '';
  const endsLabel = details.endsLabel || 'Cancel Anytime';

  return `
    <dl class="cart-subscription-details__list">
      ${planLabel ? `
        <div class="cart-subscription-details__row">
          <dt class="cart-subscription-details__label">Subscription Plan</dt>
          <dd class="cart-subscription-details__value">${escapeHtml(planLabel)}</dd>
        </div>
      ` : ''}
      ${payment ? `
        <div class="cart-subscription-details__row">
          <dt class="cart-subscription-details__label">Regular Payments</dt>
          <dd class="cart-subscription-details__value">
            <span>${escapeHtml(payment)}</span>
            ${startLabel ? `<span class="cart-subscription-details__note">starting ${escapeHtml(startLabel)}</span>` : ''}
          </dd>
        </div>
      ` : ''}
      <div class="cart-subscription-details__row">
        <dt class="cart-subscription-details__label">Subscription End Date</dt>
        <dd class="cart-subscription-details__value">${escapeHtml(endsLabel)}</dd>
      </div>
    </dl>
  `;
}

/**
 * @param {string|undefined} startDate
 * @returns {string}
 */
function formatStartDate(startDate) {
  if (!startDate) return '';
  // Quote flags already localize dates ("9/15/26"). Reparsing those shifts the year.
  if (!/^\d{4}-\d{2}-\d{2}/.test(startDate)) return startDate;
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

/**
 * Paints cached subscription price and line total into drop-in slots.
 * @param {Map<string, { ctx: HTMLElement, item?: object }>} priceSlots
 * @param {Map<string, { ctx: HTMLElement, item?: { quantity?: number } }>} totalSlots
 * @param {string} uid
 * @param {CartSubscriptionDetails|null|undefined} details
 * @param {{ quantity?: number, regularPrice?: { value?: number } }|undefined} [item]
 */
export function applySubscriptionLinePrices(priceSlots, totalSlots, uid, details, item) {
  if (!uid || details?.purchaseType !== 'subscription' || !details.price) return;

  const priceSlot = priceSlots.get(uid);
  if (priceSlot) {
    renderSubscriptionPrice(priceSlot.ctx, details);
  }

  const totalSlot = totalSlots.get(uid);
  if (totalSlot) {
    const quantity = item?.quantity ?? totalSlot.item?.quantity;
    renderSubscriptionTotal(totalSlot.ctx, details, quantity);
  }
}

/**
 * Replaces the catalog line price with the subscription amount.
 * @param {HTMLElement} ctx
 * @param {CartSubscriptionDetails|null|undefined} details
 */
export function renderSubscriptionPrice(ctx, details) {
  if (!ctx || typeof ctx.replaceWith !== 'function') return;
  if (!details || details.purchaseType !== 'subscription' || !details.price) return;

  const row = document.createElement('span');
  row.className = 'subscription-item-price__row';

  const priceElement = document.createElement('span');
  priceElement.className = 'subscription-item-price__final';
  priceElement.setAttribute('aria-label', 'Subscription price');
  priceElement.textContent = formatMoney(details.price);
  row.appendChild(priceElement);
  ctx.replaceWith(row);
}

/**
 * One-time lines keep the drop-in price. Subscription lines show the plan price.
 * @param {Array<{
 *   uid?: string,
 *   sku?: string,
 *   topLevelSku?: string,
 *   quantity?: number,
 * }>|null|undefined} items
 * @param {Map<string, CartSubscriptionDetails>} detailsByUid
 */
export function paintMiniCartSubscriptionPrices(items, detailsByUid) {
  const rows = document.querySelectorAll('.cart-mini-cart .dropin-cart-item');
  rows.forEach((row) => {
    const skuNode = row.querySelector('.dropin-cart-item__sku');
    const skuText = skuNode?.textContent?.trim().toLowerCase() || '';
    const item = (items || []).find((entry) => {
      const sku = entry?.sku?.trim().toLowerCase();
      const topLevelSku = entry?.topLevelSku?.trim().toLowerCase();
      return skuText && (skuText === sku || skuText === topLevelSku);
    });
    const details = item?.uid ? detailsByUid.get(item.uid) : null;
    const total = row.querySelector('.dropin-cart-item__total');
    const price = row.querySelector('.dropin-cart-item__price');

    if (!details || details.purchaseType !== 'subscription' || !details.price) {
      restoreMiniCartPrice(row);
      return;
    }

    replaceDisplayedPrice(price, formatMoney(details.price));
    hideOneTimePrices(row);

    if (!(total instanceof HTMLElement)) return;

    const quantity = Number(item?.quantity) || 1;
    if (quantity > 1) {
      showMiniCartTotal(total);
      const saleTotal = total.querySelector('[data-testid="discount-total"]') || total;
      replaceDisplayedPrice(saleTotal, formatMoney({
        value: details.price.value * quantity,
        currency: details.price.currency,
      }));
      return;
    }

    total.hidden = true;
    total.style.display = 'none';
    total.dataset.subscriptionHidden = 'true';
  });
}

/**
 * Drop-in shows the catalog price beside the charged price when they differ.
 * Mini-cart keeps the subscription amount only.
 * @param {Element} row
 */
function hideOneTimePrices(row) {
  row.querySelectorAll('.dropin-price--strikethrough').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.hidden = true;
    node.dataset.subscriptionHidden = 'true';
  });
}

/**
 * @param {HTMLElement} total
 */
function showMiniCartTotal(total) {
  total.hidden = false;
  total.style.removeProperty('display');
  delete total.dataset.subscriptionHidden;
}

/**
 * @param {Element} row
 */
function restoreMiniCartPrice(row) {
  const total = row.querySelector('.dropin-cart-item__total');
  if (total instanceof HTMLElement && total.dataset.subscriptionHidden === 'true') {
    showMiniCartTotal(total);
  }

  row.querySelectorAll('[data-subscription-hidden="true"]').forEach((node) => {
    if (!(node instanceof HTMLElement) || node === total) return;
    node.hidden = false;
    delete node.dataset.subscriptionHidden;
  });
}

/**
 * @param {Element|null} container
 * @param {string} label
 */
function replaceDisplayedPrice(container, label) {
  if (!container || !label) return;

  const quantity = container.querySelector('.dropin-cart-item__price__quantity');
  const priceNodes = [...container.querySelectorAll('.dropin-price')]
    .filter((node) => node !== quantity && !quantity?.contains(node));
  if (priceNodes.length) {
    priceNodes.forEach((node) => {
      node.textContent = label;
    });
    return;
  }

  const leaf = [...container.querySelectorAll('span, div')].find((node) => (
    node !== quantity
    && !quantity?.contains(node)
    && node.childElementCount === 0
    && /\d/.test(node.textContent || '')
  ));
  if (leaf) {
    leaf.textContent = label;
    return;
  }

  let sibling = quantity?.nextSibling;
  while (sibling) {
    if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent?.trim()) {
      sibling.textContent = ` ${label}`;
      return;
    }
    if (sibling.nodeType === Node.ELEMENT_NODE) {
      sibling.textContent = label;
      return;
    }
    sibling = sibling.nextSibling;
  }

  const money = /[$€£¥]\s?[\d.,]+/;
  [...container.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && money.test(node.textContent || '')) {
      node.textContent = node.textContent.replace(money, label);
    }
  });
}

/**
 * Renders subscription item total price based on quantity and unit price.
 * @param {HTMLElement} ctx
 * @param {CartSubscriptionDetails|null|undefined} details
 * @param {number} quantity
 */
export function renderSubscriptionTotal(ctx, details, quantity) {
  if (!ctx || typeof ctx.replaceWith !== 'function') return;
  if (!details || details.purchaseType !== 'subscription' || !details.price) return;
  if (typeof quantity !== 'number') return;

  const totalElement = document.createElement('span');
  totalElement.className = 'subscription-item-total';
  totalElement.textContent = formatMoney({
    value: details.price.value * quantity,
    currency: details.price.currency,
  });

  ctx.replaceWith(totalElement);
}
