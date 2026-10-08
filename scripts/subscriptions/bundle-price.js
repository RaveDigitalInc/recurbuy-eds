/**
 * Magento SARP bundle price parity for AccS EDS.
 *
 * Selections + unit prices come from Commerce Catalog Service on `pdp/data`
 * (native bundle options) — not from RecurBuy. RecurBuy only supplies
 * `optionPlanData` percents via `subscription-config`. Magento Luma does the
 * same split (`optionConfig` vs SARP JSON).
 *
 * Magento `bundle-options-mixin.js`: scale each selection line by plan percent
 * (PHP-like round), then sum.
 */

/**
 * AccS / Catalog Service encodes bundle picks as base64 `bundle/{optionId}/{selectionId}/{qty}`.
 *
 * @param {string|null|undefined} uid
 * @returns {{ optionId: number, selectionId: number, qty: number }|null}
 */
export function decodeAccsBundleOptionUid(uid) {
  if (typeof uid !== 'string' || !uid.trim()) return null;
  try {
    const decoded = atob(uid.trim());
    const match = /^bundle\/(\d+)\/(\d+)\/(\d+)$/i.exec(decoded);
    if (!match) return null;
    return {
      optionId: Number(match[1]),
      selectionId: Number(match[2]),
      qty: Number(match[3]) || 1,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string[]|null|undefined} optionsUIDs
 * @returns {Record<number, number>}
 */
export function selectionStateFromAccsOptionUids(optionsUIDs) {
  /** @type {Record<number, number>} */
  const state = {};
  if (!Array.isArray(optionsUIDs)) return state;

  for (const uid of optionsUIDs) {
    const decoded = decodeAccsBundleOptionUid(uid);
    if (!decoded) continue;
    state[decoded.optionId] = decoded.selectionId;
  }
  return state;
}

/**
 * @typedef {Object} AccsBundleSelection
 * @property {number} selection_id
 * @property {string} [uid]
 * @property {number} price
 * @property {number} qty
 * @property {boolean} is_default
 */

/**
 * @typedef {Object} AccsBundleOption
 * @property {number} option_id
 * @property {AccsBundleSelection[]} selections
 */

/**
 * Read Magento-native bundle options from AccS PDP product model (`pdp/data`).
 *
 * @param {any} product AccS ProductModel / GraphQL-shaped complex product
 * @param {boolean} [useAdvancedPricing] Magento `isUsedAdvancedPricing` — when false,
 *   use regular (old) price like mixin `_cancelAdvancedPrices`
 * @returns {AccsBundleOption[]}
 */
export function extractAccsBundleOptions(product, useAdvancedPricing = false) {
  const options = product?.options;
  if (!Array.isArray(options) || options.length === 0) return [];

  /** @type {AccsBundleOption[]} */
  const result = [];

  for (const option of options) {
    const optionId = Number(option?.id);
    if (!Number.isFinite(optionId) || optionId <= 0) continue;

    const items = Array.isArray(option.items)
      ? option.items
      : (Array.isArray(option.values) ? option.values : []);
    if (!items.length) continue;

    /** @type {AccsBundleSelection[]} */
    const selections = [];

    for (const item of items) {
      const uid = typeof item?.id === 'string'
        ? item.id
        : (typeof item?.value === 'string' ? item.value : '');
      const decoded = decodeAccsBundleOptionUid(uid);
      const selectionId = decoded?.selectionId
        ?? Number(item?.selection_id)
        ?? 0;
      if (!selectionId) continue;

      const qty = decoded?.qty
        || Number(item?.quantity)
        || Number(item?.qty)
        || 1;
      const unitPrice = readAccsSelectionUnitPrice(item, useAdvancedPricing);
      if (unitPrice == null) continue;

      selections.push({
        selection_id: selectionId,
        uid,
        price: unitPrice,
        qty: qty > 0 ? qty : 1,
        is_default: Boolean(
          item?.isDefault
          || item?.is_default
          || item?.selected,
        ),
      });
    }

    if (selections.length) {
      result.push({ option_id: optionId, selections });
    }
  }

  return result;
}

/**
 * @param {any} item
 * @param {boolean} useAdvancedPricing
 * @returns {number|null}
 */
function readAccsSelectionUnitPrice(item, useAdvancedPricing) {
  const product = item?.product;
  if (!product || typeof product !== 'object') return null;

  const finalAmount = readMoneyAmount(
    product.price?.final?.amount
    ?? product.prices?.final
    ?? product.price?.final,
  );
  const regularAmount = readMoneyAmount(
    product.price?.regular?.amount
    ?? product.prices?.regular
    ?? product.price?.regular,
  );

  // Magento mixin: without advanced pricing, subscription math uses old/regular.
  if (!useAdvancedPricing && regularAmount != null) return regularAmount;
  if (finalAmount != null) return finalAmount;
  return regularAmount;
}

/**
 * @param {any} raw
 * @returns {number|null}
 */
function readMoneyAmount(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (typeof raw.value === 'number' && Number.isFinite(raw.value)) return raw.value;
    if (typeof raw.amount === 'number' && Number.isFinite(raw.amount)) return raw.amount;
  }
  return null;
}

/**
 * @param {AccsBundleOption[]} bundleOptions
 * @returns {Record<number, number>}
 */
export function defaultSelectionState(bundleOptions) {
  /** @type {Record<number, number>} */
  const state = {};
  if (!Array.isArray(bundleOptions)) return state;

  for (const option of bundleOptions) {
    const defaultSelection = option.selections?.find((row) => row.is_default)
      || option.selections?.[0];
    if (defaultSelection) {
      state[option.option_id] = defaultSelection.selection_id;
    }
  }
  return state;
}

/**
 * Magento `_improvedRoundAmount` (same bias as PHP round).
 * @param {number} num
 * @param {number} dec
 * @returns {number}
 */
export function improvedRoundAmount(num, dec) {
  const sign = num >= 0 ? 1 : -1;
  return parseFloat(
    (Math.round((num * (10 ** dec)) + (sign * 0.0001)) / (10 ** dec)).toFixed(dec),
  );
}

/**
 * Magento `_applyPercent`: round(amount * percent, 0) / 100 per price amount.
 * @param {number} amount
 * @param {number} percent
 * @returns {number}
 */
export function applyPlanPercent(amount, percent) {
  if (!Number.isFinite(amount) || !Number.isFinite(percent)) return amount;
  return improvedRoundAmount(amount * percent, 0) / 100;
}

/**
 * One-off configured total (Magento price-bundle sum before subscription %).
 *
 * @param {AccsBundleOption[]} bundleOptions
 * @param {Record<number, number>} selectionState
 * @returns {number}
 */
export function calculateConfiguredTotal(bundleOptions, selectionState) {
  let total = 0;
  if (!Array.isArray(bundleOptions)) return 0;

  for (const option of bundleOptions) {
    const selectionId = selectionState[option.option_id];
    if (selectionId == null) continue;
    const selection = option.selections?.find((row) => row.selection_id === selectionId);
    if (!selection) continue;
    const qty = selection.qty > 0 ? selection.qty : 1;
    total += Math.max(0, selection.price) * qty;
  }

  return Math.max(0, total);
}

/**
 * Magento mixin: `_applyPercent` on each selection line, then sum.
 *
 * @param {AccsBundleOption[]} bundleOptions
 * @param {Record<number, number>} selectionState
 * @param {number} percent
 * @returns {number}
 */
export function calculateScaledConfiguredTotal(bundleOptions, selectionState, percent) {
  if (!Number.isFinite(percent)) {
    return calculateConfiguredTotal(bundleOptions, selectionState);
  }

  let total = 0;
  if (!Array.isArray(bundleOptions)) return 0;

  for (const option of bundleOptions) {
    const selectionId = selectionState[option.option_id];
    if (selectionId == null) continue;
    const selection = option.selections?.find((row) => row.selection_id === selectionId);
    if (!selection) continue;
    const qty = selection.qty > 0 ? selection.qty : 1;
    const line = Math.max(0, selection.price) * qty;
    total += applyPlanPercent(line, percent);
  }

  return Math.max(0, improvedRoundAmount(total, 2));
}

/**
 * @param {AccsBundleOption[]} bundleOptions
 * @param {Record<number, number>} selectionState
 * @param {number} subscriptionOptionId
 * @param {Record<string, { trialPercent?: number, regularPercent?: number }>|undefined} optionPlanData
 * @returns {number}
 */
export function calculateSubscriptionPrice(
  bundleOptions,
  selectionState,
  subscriptionOptionId,
  optionPlanData,
) {
  const configuredTotal = calculateConfiguredTotal(bundleOptions, selectionState);
  if (!(subscriptionOptionId > 0)) return configuredTotal;
  const plan = optionPlanData?.[String(subscriptionOptionId)];
  const percent = plan?.regularPercent;
  if (percent == null || !Number.isFinite(percent)) return configuredTotal;
  return calculateScaledConfiguredTotal(bundleOptions, selectionState, percent);
}

/**
 * @param {AccsBundleOption[]} bundleOptions
 * @param {Record<number, number>} selectionState
 * @param {number} subscriptionOptionId
 * @param {Record<string, { trialPercent?: number, regularPercent?: number }>|undefined} optionPlanData
 * @returns {number|null}
 */
export function calculateTrialPrice(
  bundleOptions,
  selectionState,
  subscriptionOptionId,
  optionPlanData,
) {
  if (!(subscriptionOptionId > 0)) return null;
  const plan = optionPlanData?.[String(subscriptionOptionId)];
  const percent = plan?.trialPercent;
  // Magento: missing/0 trial percent = no trial price box (do not emit $0 initial).
  if (percent == null || !Number.isFinite(percent) || percent <= 0) return null;
  return calculateScaledConfiguredTotal(bundleOptions, selectionState, percent);
}

/**
 * Replace `$…` money tokens in Magento detail strings when selection totals change.
 *
 * @param {Array<{ label: string, value: string }>|undefined} facts
 * @param {number} newAmount
 * @param {string} currency
 * @param {string} [locale]
 * @returns {Array<{ label: string, value: string }>|undefined}
 */
export function rewriteFactMoneyAmounts(facts, newAmount, currency, locale = 'en-US') {
  if (!Array.isArray(facts) || !facts.length) return facts;
  if (!Number.isFinite(newAmount)) return facts;

  let formatted;
  try {
    formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(newAmount);
  } catch {
    formatted = `$${newAmount.toFixed(2)}`;
  }

  return facts.map((fact) => ({
    ...fact,
    value: String(fact.value).replace(/\$[\d,]+(?:\.\d{1,2})?/g, formatted),
  }));
}
