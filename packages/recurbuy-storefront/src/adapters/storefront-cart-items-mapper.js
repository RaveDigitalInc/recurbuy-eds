import { parseSubscriptionPeriod } from '../format.js';

/**
 * @typedef {import('../contract.js').CartSubscriptionDetails} CartSubscriptionDetails
 */

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {boolean}
 */
function isStorefrontSubscriptionCartItem(row) {
  if (!row || typeof row !== 'object') return false;

  const extensionAttributes = row.extension_attributes;
  if (
    extensionAttributes
    && typeof extensionAttributes === 'object'
    && typeof extensionAttributes.aw_sarp_is_subscription === 'boolean'
  ) {
    return extensionAttributes.aw_sarp_is_subscription;
  }

  return Boolean(row.aw_sarp_is_subscription);
}

/**
 * @param {{
 *   sku?: string,
 *   topLevelSku?: string,
 * }|null|undefined} item
 * @param {Array<Record<string, unknown>>|null|undefined} rows
 * @returns {Record<string, unknown>|null}
 */
export function matchStorefrontCartItemFlagsRow(item, rows) {
  if (!item || !Array.isArray(rows) || rows.length === 0) return null;

  const sku = typeof item.sku === 'string' ? item.sku.trim() : '';
  const topLevelSku = typeof item.topLevelSku === 'string' ? item.topLevelSku.trim() : '';

  if (!sku && !topLevelSku) return null;

  const exact = rows.filter((row) => {
    const rowSku = typeof row.sku === 'string' ? row.sku.trim() : '';
    return rowSku !== '' && sku !== '' && rowSku === sku;
  });
  if (exact.length === 1) return exact[0];

  // Several variants share the parent SKU. A parent row is not this child's plan.
  if (sku && topLevelSku && sku !== topLevelSku) return null;

  const parentMatches = rows.filter((row) => {
    const rowSku = typeof row.sku === 'string' ? row.sku.trim() : '';
    return rowSku !== '' && topLevelSku !== '' && rowSku === topLevelSku;
  });

  return parentMatches.length === 1 ? parentMatches[0] : null;
}

/**
 * @param {string|undefined} planLabel
 * @returns {boolean}
 */
export function isPlaceholderPlanLabel(planLabel) {
  return !planLabel || /^Plan \d+$/.test(planLabel);
}

/**
 * Keeps session snapshot when Commerce quote has no subscription marker yet.
 * Enriches snapshot when storefront flags confirm a subscription line.
 *
 * @param {CartSubscriptionDetails|null|undefined} snapshotDetails
 * @param {Record<string, unknown>|null|undefined} flagsRow
 * @param {string} [currencyFallback='USD']
 * @returns {CartSubscriptionDetails|null}
 */
export function mergeCartSubscriptionDetailsWithFlags(
  snapshotDetails,
  flagsRow,
  currencyFallback = 'USD',
) {
  const parsed = readFlagDetails(flagsRow, currencyFallback);

  if (!parsed) {
    return snapshotDetails || null;
  }

  const { details: fromFlags, hasPeriod, hasPrice } = parsed;

  if (!snapshotDetails || snapshotDetails.purchaseType !== 'subscription') {
    return fromFlags;
  }

  const samePlan = !snapshotDetails.planId
    || !fromFlags.planId
    || String(snapshotDetails.planId) === String(fromFlags.planId);

  return {
    ...snapshotDetails,
    planId: snapshotDetails.planId || fromFlags.planId,
    subscriptionOptionId: snapshotDetails.subscriptionOptionId || fromFlags.subscriptionOptionId,
    planLabel: samePlan
      ? preferPlanLabel(snapshotDetails.planLabel, fromFlags.planLabel)
      : (snapshotDetails.planLabel || fromFlags.planLabel),
    period: samePlan && hasPeriod ? fromFlags.period : (snapshotDetails.period || fromFlags.period),
    price: samePlan && hasPrice ? fromFlags.price : (snapshotDetails.price || fromFlags.price),
    startDate: snapshotDetails.startDate || fromFlags.startDate,
    endsLabel: samePlan
      ? (fromFlags.endsLabel || snapshotDetails.endsLabel)
      : (snapshotDetails.endsLabel || fromFlags.endsLabel),
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {string} currencyFallback
 * @returns {{
 *   details: CartSubscriptionDetails,
 *   hasPeriod: boolean,
 *   hasPrice: boolean,
 * }|null}
 */
function readFlagDetails(row, currencyFallback) {
  if (!isStorefrontSubscriptionCartItem(row)) return null;

  const planId = resolvePlanId(row);
  if (!planId) return null;

  const fromOptions = parseOptionRows(row?.options, currencyFallback);
  const startDate = resolveStartDate(row, fromOptions.startDate);

  return {
    hasPeriod: Boolean(fromOptions.period),
    hasPrice: Boolean(fromOptions.price),
    details: {
      purchaseType: 'subscription',
      planId,
      subscriptionOptionId: planId,
      planLabel: fromOptions.planLabel || `Plan ${planId}`,
      period: fromOptions.period || { value: 1, unit: 'month' },
      price: fromOptions.price || { value: 0, currency: currencyFallback },
      ...(startDate && { startDate }),
      ...(fromOptions.endsLabel && { endsLabel: fromOptions.endsLabel }),
    },
  };
}

/**
 * Session snapshots saved before plan titles existed use `Plan {id}`.
 * A storefront title replaces that placeholder.
 *
 * @param {string|undefined} snapshotLabel
 * @param {string|undefined} flagsLabel
 * @returns {string|undefined}
 */
function preferPlanLabel(snapshotLabel, flagsLabel) {
  if (isPlaceholderPlanLabel(snapshotLabel) && !isPlaceholderPlanLabel(flagsLabel)) {
    return flagsLabel;
  }
  return snapshotLabel || flagsLabel;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {string|null}
 */
function resolvePlanId(row) {
  const raw = row?.aw_sarp_subscription_type;
  if (raw === null || raw === undefined) return null;
  const planId = String(raw).trim();
  return planId || null;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {string|undefined} optionStartDate
 * @returns {string|undefined}
 */
function resolveStartDate(row, optionStartDate) {
  const raw = row?.aw_sarp2_subscription_start_date;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return optionStartDate;
}

/**
 * Storefront checkout/cart-items `options` follow Magento See Details labels
 * (`Regular Payments / Weekly`, `First payment`, `Subscription End Date`), not
 * free-text "plan" / "frequency" captions.
 *
 * @param {unknown} options
 * @param {string} [currencyFallback='USD']
 * @returns {{
 *   planLabel?: string,
 *   period?: { value: number, unit: string },
 *   price?: { value: number, currency: string },
 *   startDate?: string,
 *   endsLabel?: string,
 * }}
 */
function parseOptionRows(options, currencyFallback = 'USD') {
  if (!Array.isArray(options)) {
    return {};
  }

  /** @type {Record<string, { label: string, value: string }>} */
  const byKind = {};

  options.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    const value = typeof entry.value === 'string' ? entry.value.trim() : '';
    if (!label || !value) return;

    const kind = classifyOptionLabel(label);
    if (!kind || byKind[kind]) return;
    byKind[kind] = { label, value };
  });

  const result = {};
  if (byKind.plan) {
    result.planLabel = byKind.plan.value;
  }

  const paymentRow = byKind.regular || byKind.first;
  if (paymentRow) {
    const price = parseFirstMoney(paymentRow.value, currencyFallback);
    if (price) result.price = price;
    const period = periodAfterSlash(paymentRow.label) || periodAfterSlash(paymentRow.value);
    if (period) result.period = period;
  }

  if (byKind.start) {
    result.startDate = byKind.start.value;
  }
  if (byKind.end) {
    result.endsLabel = byKind.end.value;
  }

  return result;
}

/**
 * @param {string} label
 * @returns {'plan'|'regular'|'first'|'start'|'end'|null}
 */
function classifyOptionLabel(label) {
  const normalized = label.trim().toLowerCase();

  if (/^(subscription plan|plan|subscription type)\b/.test(normalized)) {
    return 'plan';
  }
  if (/^(regular payments|regular offer)\b/.test(normalized)) {
    return 'regular';
  }
  if (/^first payment\b/.test(normalized)) {
    return 'first';
  }
  if (/^(subscription starts|subscription start date|start date)\b/.test(normalized)) {
    return 'start';
  }
  if (/^subscription end date\b/.test(normalized)) {
    return 'end';
  }

  return null;
}

/**
 * "Regular Payments / Weekly" and "$12.00 / Week for 3 Months" → the cycle after the slash.
 * @param {string} text
 * @returns {import('../contract.js').SubscriptionPeriod|undefined}
 */
function periodAfterSlash(text) {
  const parts = text.split(/\s+\/\s+/);
  if (parts.length < 2) return undefined;
  const candidate = parts[1].replace(/\s+for\s+.*/i, '').trim();
  if (!candidate || /^[\d$€£¥]/.test(candidate)) return undefined;
  return parseSubscriptionPeriod(candidate);
}

const CURRENCY_BY_SYMBOL = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
};

/**
 * First currency amount in a Magento details string.
 * "3 x $17.50" and "$17 (inc. $0 initial fee)" both resolve to 17.50 / 17.
 *
 * @param {string} value
 * @param {string} currencyFallback
 * @returns {{ value: number, currency: string }|null}
 */
function parseFirstMoney(value, currencyFallback) {
  const text = String(value).trim();
  if (/^free$/i.test(text)) {
    return { value: 0, currency: currencyFallback };
  }

  const prefixed = text.match(/(USD|EUR|GBP|[$€£¥])\s*(\d+(?:[.,]\d+)?)/i);
  if (prefixed) {
    const amount = toAmount(prefixed[2]);
    if (amount === null) return null;
    return {
      value: amount,
      currency: currencyCode(prefixed[1], currencyFallback),
    };
  }

  const suffixed = text.match(/(\d+(?:[.,]\d+)?)\s*(USD|EUR|GBP|[$€£¥])/i);
  if (suffixed) {
    const amount = toAmount(suffixed[1]);
    if (amount === null) return null;
    return { value: amount, currency: currencyCode(suffixed[2], currencyFallback) };
  }

  const bare = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!bare) return null;
  const amount = toAmount(bare[1]);
  if (amount === null) return null;
  return { value: amount, currency: currencyFallback };
}

/**
 * @param {string} token
 * @param {string} fallback
 * @returns {string}
 */
function currencyCode(token, fallback) {
  if (CURRENCY_BY_SYMBOL[token]) return CURRENCY_BY_SYMBOL[token];
  if (/^[A-Z]{3}$/i.test(token)) return token.toUpperCase();
  return fallback;
}

/**
 * @param {string} raw
 * @returns {number|null}
 */
function toAmount(raw) {
  const normalized = raw.includes(',') && !raw.includes('.')
    ? raw.replace(',', '.')
    : raw.replace(/,/g, '');
  const amount = parseFloat(normalized);
  return Number.isFinite(amount) ? amount : null;
}
