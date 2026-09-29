import { SUBSCRIPTION_ERROR_CODES } from '../contract.js';

const PERIOD_UNIT_ALIASES = {
  day: 'day',
  days: 'day',
  daily: 'day',
  week: 'week',
  weeks: 'week',
  weekly: 'week',
  month: 'month',
  months: 'month',
  monthly: 'month',
  year: 'year',
  years: 'year',
  yearly: 'year',
};

/**
 * @param {string} rawUnit
 * @returns {string}
 */
function normalizePeriodUnit(rawUnit) {
  if (!rawUnit) return 'month';
  const key = rawUnit.toLowerCase().replace(/ly$/, '');
  return PERIOD_UNIT_ALIASES[key] || key;
}

/**
 * Парсит периодичность вида "/ month", "Month", "every 2 weeks", "2 weeks" или объект { value, unit }
 * @param {string|{value: number, unit: string}|undefined} rawPeriod
 * @returns {{ value: number, unit: string }}
 */
function parsePeriod(rawPeriod) {
  if (typeof rawPeriod === 'object' && rawPeriod !== null) {
    return {
      value: Number(rawPeriod.value) || 1,
      unit: normalizePeriodUnit(rawPeriod.unit || 'month'),
    };
  }

  if (typeof rawPeriod === 'string') {
    let cleaned = rawPeriod.replace(/^\/\s*/, '').trim();
    if (/^every\s+/i.test(cleaned)) {
      cleaned = cleaned.replace(/^every\s+/i, '').trim();
    }
    const parts = cleaned.split(/\s+/);

    if (parts.length === 1) {
      return { value: 1, unit: normalizePeriodUnit(parts[0]) };
    }

    if (parts.length >= 2) {
      const value = parseInt(parts[0], 10);
      const unit = normalizePeriodUnit(parts[1]);
      return {
        value: Number.isNaN(value) ? 1 : value,
        unit: unit || 'month',
      };
    }
  }

  return { value: 1, unit: 'month' };
}

/**
 * Извлекает числовое значение цены из числа, строки или объекта с ключом amount / finalAmount
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

/**
 * Карта символов валют в коде ISO 4217
 */
const CURRENCY_SYMBOL_MAP = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '₹': 'INR',
  '¥': 'JPY',
  'руб.': 'RUB',
  'руб': 'RUB',
  'BYN': 'BYN',
};

/**
 * Нормализует код валюты: использует переданную валюту (из PDP), маппит символ или возвращает fallback
 * @param {string} [currencyFormat]
 * @param {string} [rawCurrency]
 * @param {string} [fallback]
 * @returns {string}
 */
function resolveCurrency(currencyFormat, rawCurrency, fallback = 'USD') {
  // 1. Если rawCurrency уже трёхбуквенный ISO-код
  if (typeof rawCurrency === 'string' && /^[A-Z]{3}$/i.test(rawCurrency.trim())) {
    return rawCurrency.trim().toUpperCase();
  }

  // 2. Попытка извлечь символ из currencyFormat (например, "$%s" -> "$") и смаппить в ISO
  if (currencyFormat) {
    const match = currencyFormat.match(/([^%s\d\s]+)/);
    const symbol = match ? match[1] : null;
    if (symbol && CURRENCY_SYMBOL_MAP[symbol]) {
      return CURRENCY_SYMBOL_MAP[symbol];
    }
  }

  // 3. Если сама rawCurrency — символ (например, "$")
  if (rawCurrency && CURRENCY_SYMBOL_MAP[rawCurrency]) {
    return CURRENCY_SYMBOL_MAP[rawCurrency];
  }

  return fallback;
}

/**
 * Преобразует ответ от панельного API в формат SubscriptionEligibility
 * 
 * @param {Object} payload Ответ от сервера
 * @param {string} sku Артикул товара
 * @param {Object} [pdpProduct] Данные товара с PDP для точной валюты
 * @returns {import('../contract.js').SubscriptionEligibility}
 */
/**
 * @param {Record<string, unknown>|undefined} planOptions
 * @param {string} optionKey
 * @returns {string|undefined}
 */
function resolvePlanTitle(planOptions, optionKey) {
  const entry = planOptions?.[optionKey];
  if (entry && typeof entry === 'object' && entry !== null) {
    const title = /** @type {{ title?: string }} */ (entry).title;
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

  // Опция "0" зарезервирована для разовой покупки
  const subscriptionOptionKeys = optionKeys.filter((key) => key !== '0');
  const eligible = subscriptionOptionKeys.length > 0;

  // Разовая покупка разрешена, если присутствует ключ "0" в options или regularPrices.options
  const allowOneTime = '0' in options || '0' in (payload?.regularPrices?.options || {});

  // Контракт требует 'one_time' вместо 'one-time'
  const rawDefaultType = payload?.preselectDefault?.subscriptionOptionId
    ? 'subscription'
    : (payload?.defaultPurchaseType || 'one_time');

  const defaultPurchaseType = rawDefaultType === 'one-time' ? 'one_time' : rawDefaultType;
  const selectedPlanId = payload?.selectedSubscriptionOptionId
    || payload?.preselectDefault?.subscriptionOptionId
    || null;

  // Приоритет валюты: PDP product.prices.final.currency -> raw payload currency -> currencyFormat symbol map
  const pdpCurrency = pdpProduct?.prices?.final?.currency || pdpProduct?.price?.final?.amount?.currency;
  const currency = resolveCurrency(payload?.currencyFormat, pdpCurrency || payload?.currency);

  // Формирование планов подписки (исключая ключ "0")
  const plans = subscriptionOptionKeys.map((key) => {
    const opt = options[key] || {};
    const details = payload?.subscriptionDetails?.[key] || {};

    // 1. Определение регулярной цены
    const regularPriceRaw = opt?.finalPrice?.amount
      ?? opt?.price
      ?? payload?.regularPrices?.options?.[key]?.finalPrice?.amount
      ?? payload?.finalPrice?.amount
      ?? 0;
    const regularPriceValue = parsePriceValue(regularPriceRaw);

    // 2. Определение начальной/первой цены (Magento first_payment block)
    const firstPayment = details?.first_payment;
    const initialPriceRaw = (firstPayment && typeof firstPayment === 'object')
      ? (firstPayment.finalAmount ?? firstPayment)
      : (details?.first_payment ?? regularPriceValue);
    const initialPriceValue = parsePriceValue(initialPriceRaw);

    // 3. Извлечение периода: берем из opt.finalPrice.aw_period, fallback на details.period или opt.aw_period
    const rawPeriod = opt?.finalPrice?.aw_period || details?.period || opt?.aw_period;
    const period = parsePeriod(rawPeriod);

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
    productType: payload?.productType || 'simple',
    eligible,
    allowOneTime,
    defaultPurchaseType,
    selectedPlanId,
    plans,
  };
}