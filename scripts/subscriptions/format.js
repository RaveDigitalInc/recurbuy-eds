/**
 * Formatting helpers for subscription UI.
 */

/**
 * @param {import('./contract.js').MoneyAmount|null|undefined} amount
 * @param {string} [locale]
 * @returns {string}
 */
export function formatMoney(amount, locale = 'en-US') {
  if (!amount || typeof amount.value !== 'number') return '';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: amount.currency || 'USD',
    }).format(amount.value);
  } catch {
    return `${amount.currency || 'USD'} ${amount.value.toFixed(2)}`;
  }
}

const PERIOD_UNITS = {
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
 * @param {string|undefined|null} rawUnit
 * @returns {import('./contract.js').PeriodUnit|string}
 */
function normalizePeriodUnit(rawUnit) {
  if (!rawUnit) return 'month';
  const key = String(rawUnit).toLowerCase().replace(/ly$/, '');
  return PERIOD_UNITS[key] || key;
}

/**
 * Parses "/ month", "every 2 weeks", "2 weeks", or `{ value, unit }`.
 * @param {string|{ value?: number, unit?: string }|undefined|null} rawPeriod
 * @returns {import('./contract.js').SubscriptionPeriod}
 */
export function parseSubscriptionPeriod(rawPeriod) {
  if (rawPeriod && typeof rawPeriod === 'object') {
    return {
      value: Number(rawPeriod.value) || 1,
      unit: /** @type {import('./contract.js').PeriodUnit} */ (
        normalizePeriodUnit(rawPeriod.unit || 'month')
      ),
    };
  }

  if (typeof rawPeriod !== 'string' || !rawPeriod.trim()) {
    return { value: 1, unit: 'month' };
  }

  const parts = rawPeriod.replace(/^\/\s*/, '').trim().replace(/^every\s+/i, '').split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 1) {
    return {
      value: 1,
      unit: /** @type {import('./contract.js').PeriodUnit} */ (normalizePeriodUnit(parts[0])),
    };
  }

  const value = parseInt(parts[0], 10);
  return {
    value: Number.isNaN(value) ? 1 : value,
    unit: /** @type {import('./contract.js').PeriodUnit} */ (normalizePeriodUnit(parts[1])),
  };
}

/**
 * Billing cycle label used beside a price, for example "Week" or "2 Months".
 * @param {import('./contract.js').SubscriptionPeriod|null|undefined} period
 * @returns {string}
 */
export function formatBillingCycle(period) {
  if (!period?.unit) return '';

  const units = {
    day: 'Day',
    week: 'Week',
    month: 'Month',
    year: 'Year',
  };
  const unit = units[period.unit] || period.unit;
  if (!period.value || period.value === 1) return unit;
  return `${period.value} ${unit}s`;
}

/**
 * @param {import('./contract.js').SubscriptionPeriod|null|undefined} period
 * @returns {string}
 */
export function formatPeriod(period) {
  if (!period?.value || !period?.unit) return '';

  const unitLabels = {
    day: period.value === 1 ? 'day' : 'days',
    week: period.value === 1 ? 'week' : 'weeks',
    month: period.value === 1 ? 'month' : 'months',
    year: period.value === 1 ? 'year' : 'years',
  };

  const unit = unitLabels[period.unit] || period.unit;
  return period.value === 1 ? `every ${unit}` : `every ${period.value} ${unit}`;
}

/**
 * @param {import('./contract.js').SubscriptionDiscount|null|undefined} discount
 * @returns {string}
 */
export function formatDiscount(discount) {
  if (!discount || typeof discount.value !== 'number') return '';

  if (discount.type === 'percent') {
    return `Save ${discount.value}%`;
  }

  return `Save ${discount.value}`;
}

/**
 * @param {import('./contract.js').SubscriptionPlan|null|undefined} plan
 * @returns {import('./contract.js').MoneyAmount|null}
 */
export function getPlanDisplayPrice(plan) {
  if (!plan?.prices) return null;
  return plan.prices.initial || plan.prices.regular || null;
}

/**
 * @param {import('./contract.js').SubscriptionPlan|null|undefined} plan
 * @returns {boolean}
 */
export function hasPlanSavings(plan) {
  if (!plan?.prices?.initial || !plan?.prices?.regular) return false;
  return plan.prices.initial.value < plan.prices.regular.value;
}
