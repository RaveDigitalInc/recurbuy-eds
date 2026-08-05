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
