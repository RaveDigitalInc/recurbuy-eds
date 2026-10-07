import { parseSubscriptionPeriod } from '../format.js';

/**
 * @param {any} priceVal
 * @returns {number}
 */
function parsePriceValue(priceVal) {
  if (typeof priceVal === 'number') return priceVal;
  if (typeof priceVal === 'string') return parseFloat(priceVal) || 0;
  if (typeof priceVal === 'object' && priceVal !== null) {
    if (typeof priceVal.finalAmount === 'number') return priceVal.finalAmount;
    if (typeof priceVal.amount === 'number') return priceVal.amount;
    if (typeof priceVal.value === 'number') return priceVal.value;
    if (typeof priceVal.finalAmount === 'string') return parseFloat(priceVal.finalAmount) || 0;
    if (typeof priceVal.amount === 'string') return parseFloat(priceVal.amount) || 0;
  }
  return 0;
}

const CURRENCY_SYMBOL_MAP = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '₹': 'INR',
  '¥': 'JPY',
  'руб.': 'RUB',
  руб: 'RUB',
  BYN: 'BYN',
};

/**
 * Maps a PDP currency code or a currency symbol to an ISO code.
 * @param {string} [currencyFormat]
 * @param {string} [rawCurrency]
 * @param {string} [fallback]
 * @returns {string}
 */
function resolveCurrency(currencyFormat, rawCurrency, fallback = 'USD') {
  if (typeof rawCurrency === 'string' && /^[A-Z]{3}$/i.test(rawCurrency.trim())) {
    return rawCurrency.trim().toUpperCase();
  }

  if (currencyFormat) {
    const match = currencyFormat.match(/([^%s\d\s]+)/);
    const symbol = match ? match[1] : null;
    if (symbol && CURRENCY_SYMBOL_MAP[symbol]) {
      return CURRENCY_SYMBOL_MAP[symbol];
    }
  }

  if (rawCurrency && CURRENCY_SYMBOL_MAP[rawCurrency]) {
    return CURRENCY_SYMBOL_MAP[rawCurrency];
  }

  return fallback;
}

/**
 * @param {Record<string, unknown>|undefined} planOptions
 * @param {string} optionKey
 * @returns {string|undefined}
 */
function resolvePlanTitle(planOptions, optionKey) {
  if (!planOptions || typeof planOptions !== 'object') return undefined;

  const direct = readTitle(planOptions[optionKey]);
  if (direct) return direct;

  return Object.values(planOptions).reduce((found, nested) => {
    if (found || !nested || typeof nested !== 'object' || Array.isArray(nested)) {
      return found;
    }
    const byId = /** @type {Record<string, unknown>} */ (nested)[optionKey];
    return readTitle(byId) || found;
  }, /** @type {string|undefined} */ (undefined));
}

/**
 * @param {unknown} entry
 * @returns {string|undefined}
 */
function readTitle(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
  const { title } = /** @type {{ title?: unknown }} */ (entry);
  return typeof title === 'string' && title.trim() ? title.trim() : undefined;
}

/**
 * True for Magento's missing-title fallback ("Plan 1"), not a merchant plan name.
 * @param {string|undefined|null} label
 * @returns {boolean}
 */
function isPlaceholderPlanLabel(label) {
  return !label || /^Plan \d+$/i.test(String(label).trim());
}

/**
 * Same period + cycle count that Magento prints in subscription details
 * ("Regular Payments / Monthly" + "12 x $22.50" → "Monthly 12").
 *
 * @param {Record<string, unknown>|undefined} details
 * @returns {string|undefined}
 */
function planLabelFromPaymentDetails(details) {
  const regular = details?.regular_payment;
  if (!regular || typeof regular !== 'object') return undefined;

  const block = /** @type {{ label?: unknown, cycles?: unknown }} */ (regular);
  const label = typeof block.label === 'string' ? block.label : '';
  const period = label.includes('/') ? label.split('/').pop()?.trim() : '';
  const cycles = Number(block.cycles);

  if (period && Number.isFinite(cycles) && cycles > 1) {
    return `${period} ${cycles}`;
  }
  return period || undefined;
}

/**
 * @param {string} optionKey
 * @param {Record<string, unknown>} opt
 * @param {import('./storefront-options-list.js').SubscriptionOptionList|null} optionList
 * @param {Record<string, unknown>|undefined} planOptions
 * @param {Record<string, unknown>} details
 * @returns {string}
 */
function resolvePlanLabel(optionKey, opt, optionList, planOptions, details) {
  const candidates = [
    optionList?.titles?.[String(optionKey)],
    resolvePlanTitle(planOptions, optionKey),
    typeof details?.title === 'string' ? details.title : undefined,
    typeof opt?.label === 'string' ? opt.label : undefined,
    typeof opt?.name === 'string' ? opt.name : undefined,
    planLabelFromPaymentDetails(details),
  ];

  const title = candidates.find((value) => typeof value === 'string' && !isPlaceholderPlanLabel(value));
  return title?.trim() || `Plan ${optionKey}`;
}

/**
 * @param {Record<string, unknown>|null|undefined} payload
 * @param {string} sku
 * @param {Record<string, any>|undefined} pdpProduct
 * @param {import('./storefront-options-list.js').SubscriptionOptionList|null} [optionList]
 */
export function mapStorefrontPayloadToEligibility(payload, sku, pdpProduct, optionList = null) {
  const planOptions = payload?.planOptions;
  const options = payload?.options || payload?.regularPrices?.options || {};
  const optionKeys = Object.keys(options);

  const subscriptionOptionKeys = optionKeys.filter((key) => key !== '0');
  const eligible = subscriptionOptionKeys.length > 0;

  const pricesIncludeOneTime = '0' in options || '0' in (payload?.regularPrices?.options || {});
  const allowOneTime = typeof optionList?.allowOneTime === 'boolean'
    ? optionList.allowOneTime
    : pricesIncludeOneTime;

  const rawDefaultType = payload?.preselectDefault?.subscriptionOptionId
    ? 'subscription'
    : (payload?.defaultPurchaseType || 'one_time');
  const normalizedDefaultType = rawDefaultType === 'one-time' ? 'one_time' : rawDefaultType;
  const defaultPurchaseType = allowOneTime ? normalizedDefaultType : 'subscription';
  const selectedPlanId = asPlanId(
    payload?.selectedSubscriptionOptionId
    || payload?.preselectDefault?.subscriptionOptionId,
  );

  const pdpCurrency = pdpProduct?.prices?.final?.currency
    || pdpProduct?.price?.final?.amount?.currency;
  const currency = resolveCurrency(payload?.currencyFormat, pdpCurrency || payload?.currency);

  const plans = subscriptionOptionKeys.map((key) => {
    const opt = options[key] || {};
    const details = payload?.subscriptionDetails?.[key] || {};

    const regularPriceRaw = opt?.finalPrice?.amount
      ?? opt?.price
      ?? payload?.regularPrices?.options?.[key]?.finalPrice?.amount
      ?? payload?.finalPrice?.amount
      ?? 0;
    const regularPriceValue = parsePriceValue(regularPriceRaw);

    const firstPayment = details?.first_payment;
    const initialPriceRaw = (firstPayment && typeof firstPayment === 'object')
      ? (firstPayment.finalAmount ?? firstPayment)
      : (details?.first_payment ?? regularPriceValue);
    const initialPriceValue = parsePriceValue(initialPriceRaw);

    const rawPeriod = opt?.finalPrice?.aw_period || details?.period || opt?.aw_period;
    const period = parseSubscriptionPeriod(rawPeriod);

    const label = resolvePlanLabel(key, opt, optionList, planOptions, details);
    const facts = mapDetailFacts(details);

    return {
      id: String(key),
      label,
      period,
      prices: {
        regular: {
          value: regularPriceValue,
          currency,
        },
        ...(initialPriceValue !== regularPriceValue && {
          initial: {
            value: initialPriceValue,
            currency,
          },
        }),
      },
      ...(facts.length && { facts }),
    };
  });

  return {
    sku,
    eligible,
    allowOneTime,
    defaultPurchaseType,
    selectedPlanId,
    plans,
    ...(optionList?.subscribeAndSave && { subscribeAndSave: optionList.subscribeAndSave }),
  };
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function asPlanId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

/**
 * Visible Magento detail blocks: first / trial / regular payment, start and end.
 * @param {Record<string, unknown>|undefined} details
 * @returns {Array<{ label: string, value: string }>}
 */
function mapDetailFacts(details) {
  if (!details || typeof details !== 'object') return [];

  return Object.values(details).flatMap((block) => {
    if (!block || typeof block !== 'object') return [];
    if (block.isShow === false) return [];
    const label = typeof block.label === 'string' ? block.label.trim() : '';
    const value = typeof block.value === 'string' ? block.value.trim() : '';
    if (!label || !value) return [];
    return [{ label, value }];
  });
}
