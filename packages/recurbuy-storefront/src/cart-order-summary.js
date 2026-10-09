import { h } from '@dropins/tools/preact.js';
import { formatBillingCycle, formatMoney } from './format.js';
import { getSubscriptionOptionIdFromCartItem } from './cart-line-custom-attributes.js';

const DEFAULT_PAY_NOW = 'You pay now';
const DEFAULT_CHARGED_FOR = 'You will be charged for';

// The drop-in renders the total at sortOrder 900.
const PAY_NOW_SORT_ORDER = 850;
const CHARGED_FOR_SORT_ORDER = 950;

/**
 * @param {Array<Object>} items
 * @param {Map<string, import('./contract.js').CartSubscriptionDetails>} detailsByUid
 * @returns {Array<Object>}
 */
function getSubscriptionItems(items, detailsByUid) {
  return (items || []).filter((item) => (
    getSubscriptionOptionIdFromCartItem(item)
    || detailsByUid?.get(item?.uid)?.purchaseType === 'subscription'
  ));
}

/**
 * Recurring amount per billing cycle for the subscription lines (same currency only).
 *
 * @param {Array<Object>} subscriptionItems
 * @param {Map<string, import('./contract.js').CartSubscriptionDetails>} detailsByUid
 * @returns {{ amount: import('./contract.js').MoneyAmount, period: Object }|null}
 */
function getRecurringTotal(subscriptionItems, detailsByUid) {
  let currency = '';
  let value = 0;
  let period = null;

  const complete = subscriptionItems.every((item) => {
    const details = detailsByUid?.get(item?.uid);
    if (!details?.price || typeof details.price.value !== 'number') return false;
    if (currency && details.price.currency !== currency) return false;

    currency = details.price.currency;
    value += details.price.value * (Number(item.quantity) || 1);
    period = period || details.period;
    return true;
  });

  if (!complete || !currency) return null;
  return { amount: { value, currency }, period };
}

/**
 * Builds an `updateLineItems` callback for the cart OrderSummary container.
 * Mirrors Luma: a "You pay now" badge above the total and, below it,
 * "You will be charged for $X / Month" for the recurring part.
 *
 * @param {{
 *   getItems: () => Array<Object>,
 *   getDetailsByUid: () => Map<string, import('./contract.js').CartSubscriptionDetails>,
 *   getConfig?: () => import('./adapters/storefront-checkout-config-mapper.js')
 *     .StorefrontCheckoutConfig|null,
 *   labels?: { payNow?: string, chargedFor?: string },
 *   showChargedFor?: boolean,
 * }} options
 * @returns {(lineItems: Array<Object>) => Array<Object>}
 */
export function createSubscriptionSummaryUpdater({
  getItems,
  getDetailsByUid,
  getConfig = () => null,
  labels = {},
  showChargedFor = true,
}) {
  return (lineItems) => {
    const detailsByUid = getDetailsByUid();
    const subscriptionItems = getSubscriptionItems(getItems(), detailsByUid);
    const config = getConfig();

    if (!subscriptionItems.length) return lineItems;

    const payNowText = config?.awSarp2GrandTotalYouPayNow || labels.payNow || DEFAULT_PAY_NOW;
    const chargedForText = config?.awSarp2GrandTotalBasicCurrencyMessage
      || labels.chargedFor
      || DEFAULT_CHARGED_FOR;

    const extra = [{
      key: 'subscriptionPayNow',
      sortOrder: PAY_NOW_SORT_ORDER,
      className: 'cart-order-summary__pay-now',
      content: h('span', { className: 'subscription-pay-now' }, payNowText),
    }];

    const recurring = showChargedFor
      ? getRecurringTotal(subscriptionItems, detailsByUid)
      : null;
    if (recurring) {
      const cycle = formatBillingCycle(recurring.period);
      extra.push({
        key: 'subscriptionChargedFor',
        sortOrder: CHARGED_FOR_SORT_ORDER,
        className: 'cart-order-summary__charged-for',
        content: h('div', { className: 'subscription-charged-for' }, [
          `${chargedForText} `,
          h('strong', null, `${formatMoney(recurring.amount)}${cycle ? ` / ${cycle}` : ''}`),
        ]),
      });
    }

    return [...lineItems, ...extra];
  };
}
