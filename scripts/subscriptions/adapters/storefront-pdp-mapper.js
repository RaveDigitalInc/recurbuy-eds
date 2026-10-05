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
  const entry = planOptions?.[optionKey];
  if (entry && typeof entry === 'object' && entry !== null) {
    const { title } = /** @type {{ title?: string }} */ (entry);
    if (typeof title === 'string' && title.trim()) {
      return title.trim();
    }
  }
  return undefined;
}

export function mapStorefrontPayloadToEligibility(payload, sku, pdpProduct) {
  const planOptions = payload?.planOptions;
  const options = payload?.options || payload?.regularPrices?.options || {};
  const optionKeys = Object.keys(options);

  const subscriptionOptionKeys = optionKeys.filter((key) => key !== '0');
  const eligible = subscriptionOptionKeys.length > 0;

  const allowOneTime = '0' in options || '0' in (payload?.regularPrices?.options || {});

  const rawDefaultType = payload?.preselectDefault?.subscriptionOptionId
    ? 'subscription'
    : (payload?.defaultPurchaseType || 'one_time');

  const defaultPurchaseType = rawDefaultType === 'one-time' ? 'one_time' : rawDefaultType;
  const selectedPlanId = payload?.selectedSubscriptionOptionId
    || payload?.preselectDefault?.subscriptionOptionId
    || null;

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

    const planTitle = resolvePlanTitle(planOptions, key);
    const fallbackLabel = planTitle || details?.title || `Plan ${key}`;
    const label = opt?.label || opt?.name || fallbackLabel;

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
    };
  });

  return {
    sku,
    eligible,
    allowOneTime,
    defaultPurchaseType,
    selectedPlanId,
    plans,
  };
}
