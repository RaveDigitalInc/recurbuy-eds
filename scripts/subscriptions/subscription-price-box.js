import {
  formatDiscount,
  formatMoney,
  formatPeriod,
  getPlanDisplayPrice,
  hasPlanSavings,
} from './format.js';

/**
 * @typedef {import('./contract.js').MoneyAmount} MoneyAmount
 * @typedef {import('./contract.js').SubscriptionPlan} SubscriptionPlan
 * @typedef {import('./contract.js').PurchaseType} PurchaseType
 */

/**
 * Renders subscription-aware price content without modifying Adobe ProductPrice.
 * @param {HTMLElement} root
 * @param {{
 *   purchaseType: PurchaseType,
 *   plan?: SubscriptionPlan|null,
 *   standardPrice?: MoneyAmount|null,
 *   standardRegularPrice?: MoneyAmount|null,
 *   locale?: string,
 * }} state
 */
export function renderSubscriptionPriceBox(root, state) {
  if (!root) return;

  const {
    purchaseType,
    plan = null,
    standardPrice = null,
    standardRegularPrice = null,
    locale = 'en-US',
  } = state;

  root.className = 'subscription-price-box';
  root.hidden = false;

  if (purchaseType === 'subscription' && plan) {
    const displayPrice = getPlanDisplayPrice(plan);
    const regularPrice = plan.prices?.regular;
    const showStrike = hasPlanSavings(plan);
    const saving = formatDiscount(plan.discount);
    const periodLabel = formatPeriod(plan.period);

    root.innerHTML = `
      <div class="subscription-price-box__row">
        ${showStrike && regularPrice ? `
          <span class="subscription-price-box__regular" aria-label="Regular price">
            ${formatMoney(regularPrice, locale)}
          </span>
        ` : ''}
        <span class="subscription-price-box__final" aria-label="Subscription price">
          ${formatMoney(displayPrice, locale)}
        </span>
        ${periodLabel ? `
          <span class="subscription-price-box__period">${periodLabel}</span>
        ` : ''}
      </div>
      ${saving ? `<div class="subscription-price-box__saving">${saving}</div>` : ''}
      ${plan.prices?.initial && showStrike ? `
        <div class="subscription-price-box__caption">
          First payment ${formatMoney(plan.prices.initial, locale)}, then
          ${formatMoney(plan.prices.regular, locale)} ${periodLabel}
        </div>
      ` : ''}
    `;
    return;
  }

  const finalAmount = standardPrice;
  const regularAmount = standardRegularPrice;
  const showRegular = Boolean(
    finalAmount
    && regularAmount
    && regularAmount.value !== finalAmount.value,
  );

  root.innerHTML = `
    <div class="subscription-price-box__row">
      ${showRegular ? `
        <span class="subscription-price-box__regular" aria-label="Regular price">
          ${formatMoney(regularAmount, locale)}
        </span>
      ` : ''}
      <span class="subscription-price-box__final" aria-label="Price">
        ${formatMoney(finalAmount, locale)}
      </span>
    </div>
  `;
}

/**
 * @param {HTMLElement} root
 */
export function clearSubscriptionPriceBox(root) {
  if (!root) return;
  root.innerHTML = '';
  root.hidden = true;
  root.className = 'subscription-price-box';
}
