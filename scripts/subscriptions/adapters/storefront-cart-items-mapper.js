import { parseSubscriptionPeriod } from '../format.js';

/**
 * @typedef {import('../contract.js').CartSubscriptionDetails} CartSubscriptionDetails
 */

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {boolean}
 */
export function isStorefrontSubscriptionCartItem(row) {
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

  const skuMatches = rows.filter((row) => {
    const rowSku = typeof row.sku === 'string' ? row.sku.trim() : '';
    if (!rowSku) return false;
    return rowSku === sku || (topLevelSku && rowSku === topLevelSku);
  });

  return skuMatches[0] || null;
}

/**
 * Maps one checkout/cart-items row to cart subscription details (display only).
 *
 * @param {Record<string, unknown>|null|undefined} row
 * @param {string} [currencyFallback='USD']
 * @returns {CartSubscriptionDetails|null}
 */
export function mapStorefrontCartItemFlagsToDetails(row, currencyFallback = 'USD') {
  if (!isStorefrontSubscriptionCartItem(row)) {
    return null;
  }

  const planId = resolvePlanId(row);
  if (!planId) {
    return null;
  }

  const fromOptions = parseOptionRows(row?.options);
  const startDate = resolveStartDate(row, fromOptions.startDate);

  return {
    purchaseType: 'subscription',
    planId,
    subscriptionOptionId: planId,
    planLabel: fromOptions.planLabel || `Plan ${planId}`,
    period: fromOptions.period || { value: 1, unit: 'month' },
    price: fromOptions.price || { value: 0, currency: currencyFallback },
    ...(startDate && { startDate }),
  };
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
  const fromFlags = mapStorefrontCartItemFlagsToDetails(flagsRow, currencyFallback);

  if (!fromFlags) {
    return snapshotDetails || null;
  }

  if (!snapshotDetails || snapshotDetails.purchaseType !== 'subscription') {
    return fromFlags;
  }

  return {
    ...snapshotDetails,
    planId: snapshotDetails.planId || fromFlags.planId,
    subscriptionOptionId: snapshotDetails.subscriptionOptionId || fromFlags.subscriptionOptionId,
    planLabel: snapshotDetails.planLabel || fromFlags.planLabel,
    period: snapshotDetails.period || fromFlags.period,
    price: fromFlags.price?.value
      ? fromFlags.price
      : snapshotDetails.price,
    startDate: snapshotDetails.startDate || fromFlags.startDate,
  };
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
 * @param {unknown} options
 * @returns {{
 *   planLabel?: string,
 *   period?: { value: number, unit: string },
 *   price?: { value: number, currency: string },
 *   startDate?: string,
 * }}
 */
function parseOptionRows(options) {
  if (!Array.isArray(options)) {
    return {};
  }

  const result = {};

  options.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    const value = typeof entry.value === 'string' ? entry.value.trim() : '';
    if (!label || !value) return;

    const lowerLabel = label.toLowerCase();

    if (!result.planLabel && /plan|subscription type/i.test(lowerLabel)) {
      result.planLabel = value;
      return;
    }

    if (!result.period && /frequency|billing|every|deliver/i.test(lowerLabel)) {
      result.period = parseSubscriptionPeriod(value);
      return;
    }

    if (!result.price && /price|payment|amount/i.test(lowerLabel)) {
      const parsed = parseMoney(value);
      if (parsed) {
        result.price = parsed;
      }
      return;
    }

    if (!result.startDate && /start|first delivery/i.test(lowerLabel)) {
      result.startDate = value;
    }
  });

  return result;
}

/**
 * @param {string} value
 * @returns {{ value: number, currency: string }|null}
 */
function parseMoney(value) {
  const currencyMatch = value.match(/\b([A-Z]{3})\b/);
  const currency = currencyMatch ? currencyMatch[1] : 'USD';
  const numeric = value.replace(/[^0-9.,-]/g, '').replace(',', '.');
  const amount = parseFloat(numeric);
  if (!Number.isFinite(amount)) {
    return null;
  }

  return { value: amount, currency };
}
