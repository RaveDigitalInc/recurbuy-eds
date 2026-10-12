import { fetchGraphQl } from '@dropins/storefront-cart/api.js';
import {
  RECURBUY_BILLING_PERIOD,
  RECURBUY_ENDS_LABEL,
  RECURBUY_PLAN_LABEL,
  RECURBUY_SUBSCRIPTION_OPTION_ID,
  RECURBUY_SUBSCRIPTION_START_DATE,
} from '../contract.js';
import { parseQuoteBillingPeriod, parseSubscriptionPeriod } from '../format.js';
import { isPlaceholderPlanLabel } from './storefront-cart-items-mapper.js';
import { peekCachedSubscriptionConfig } from './subscription-config-cache.js';

const QUOTE_SUBSCRIPTION_MARKERS_QUERY = `
  query QuoteSubscriptionMarkers($cartId: String!) {
    cart(cart_id: $cartId) {
      itemsV2 {
        items {
          uid
          product { uid }
          ... on ConfigurableCartItem {
            configured_variant { uid }
          }
          prices { price { value currency } }
          custom_attributes { attribute_code value }
        }
      }
    }
  }
`;

/**
 * Cart-item custom attributes are the quote's subscription SoR.
 *
 * @param {string} cartId
 * @returns {Promise<Map<string, {
 *   optionId: string,
 *   catalogProductId: string,
 *   unitPrice: number|null,
 *   currency: string,
 *   startDate: string,
 *   planLabel: string,
 *   period: import('../contract.js').SubscriptionPeriod|null,
 *   endsLabel: string,
 * }>>}
 */
export async function loadQuoteSubscriptionMarkers(cartId) {
  const markers = new Map();
  const normalizedCartId = typeof cartId === 'string' ? cartId.trim() : '';
  if (!normalizedCartId) return markers;

  let response;
  try {
    response = await fetchGraphQl(QUOTE_SUBSCRIPTION_MARKERS_QUERY, {
      variables: { cartId: normalizedCartId },
    });
  } catch {
    return markers;
  }

  const items = response?.data?.cart?.itemsV2?.items;
  if (!Array.isArray(items)) return markers;

  items.forEach((item) => {
    const uid = typeof item?.uid === 'string' ? item.uid : '';
    const attrs = item?.custom_attributes;
    const optionId = attributeValue(attrs, RECURBUY_SUBSCRIPTION_OPTION_ID);
    if (!uid || !optionId || optionId === '0') return;

    const unitPrice = Number(item?.prices?.price?.value);
    markers.set(uid, {
      optionId,
      catalogProductId: catalogProductId(item),
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
      currency: typeof item?.prices?.price?.currency === 'string'
        ? item.prices.price.currency
        : 'USD',
      startDate: attributeValue(attrs, RECURBUY_SUBSCRIPTION_START_DATE),
      planLabel: attributeValue(attrs, RECURBUY_PLAN_LABEL),
      period: parseQuoteBillingPeriod(attributeValue(attrs, RECURBUY_BILLING_PERIOD)),
      endsLabel: attributeValue(attrs, RECURBUY_ENDS_LABEL),
    });
  });

  return markers;
}

/**
 * @param {{
 *   optionId: string,
 *   catalogProductId: string,
 *   unitPrice: number|null,
 *   currency: string,
 *   startDate: string,
 *   planLabel: string,
 *   period: import('../contract.js').SubscriptionPeriod|null,
 *   endsLabel: string,
 * }} marker
 * @returns {Promise<import('../contract.js').CartSubscriptionDetails>}
 */
export async function subscriptionDetailsFromQuoteMarker(marker) {
  // Prefer presentation written onto the quote at add time. Cached PDP config is
  // only a fallback for lines stamped before those attributes existed.
  const cached = needsCachedPresentation(marker)
    ? presentationFromCachedConfig(marker.catalogProductId, marker.optionId)
    : emptyPresentation();

  const planLabel = !isPlaceholderPlanLabel(marker.planLabel)
    ? marker.planLabel
    : (cached.planLabel || `Plan ${marker.optionId}`);
  const period = marker.period || cached.period || { value: 1, unit: 'month' };
  const endsLabel = marker.endsLabel || cached.endsLabel;
  const startDate = marker.startDate || cached.startDate;
  const priceValue = marker.unitPrice ?? cached.priceValue;

  return {
    purchaseType: 'subscription',
    planId: marker.optionId,
    subscriptionOptionId: marker.optionId,
    planLabel,
    period,
    price: {
      value: Number.isFinite(priceValue) ? priceValue : 0,
      currency: marker.currency || cached.currency || 'USD',
    },
    ...(startDate ? { startDate } : {}),
    ...(endsLabel ? { endsLabel } : {}),
  };
}

/**
 * @param {{
 *   planLabel: string,
 *   period: import('../contract.js').SubscriptionPeriod|null,
 *   endsLabel: string,
 * }} marker
 * @returns {boolean}
 */
function needsCachedPresentation(marker) {
  return isPlaceholderPlanLabel(marker.planLabel)
    || !marker.period
    || !marker.endsLabel;
}

/**
 * @param {Array<{ attribute_code?: string, value?: string }>|null|undefined} attributes
 * @param {string} code
 * @returns {string}
 */
function attributeValue(attributes, code) {
  if (!Array.isArray(attributes)) return '';
  const match = attributes.find((attribute) => attribute?.attribute_code === code);
  return typeof match?.value === 'string' ? match.value.trim() : '';
}

/**
 * Commerce product uid is the base64 catalog id (`OTg=` → `98`).
 * The configured variant is the child that owns the option.
 *
 * @param {{ product?: { uid?: string }, configured_variant?: { uid?: string } }} item
 * @returns {string}
 */
function catalogProductId(item) {
  return decodeCatalogId(item?.configured_variant?.uid) || decodeCatalogId(item?.product?.uid);
}

/**
 * @param {string|undefined} uid
 * @returns {string}
 */
function decodeCatalogId(uid) {
  if (typeof uid !== 'string' || uid.trim() === '') return '';
  try {
    const decoded = atob(uid).trim();
    return /^\d+$/.test(decoded) ? decoded : '';
  } catch {
    return '';
  }
}

/**
 * @returns {{
 *   planLabel: string,
 *   period: import('../contract.js').SubscriptionPeriod|null,
 *   startDate: string,
 *   endsLabel: string,
 *   priceValue: number|null,
 *   currency: string,
 * }}
 */
function emptyPresentation() {
  return {
    planLabel: '',
    period: null,
    startDate: '',
    endsLabel: '',
    priceValue: null,
    currency: '',
  };
}

/**
 * Read-only: never starts a network request.
 *
 * @param {string} productId
 * @param {string} optionId
 * @returns {{
 *   planLabel: string,
 *   period: import('../contract.js').SubscriptionPeriod|null,
 *   startDate: string,
 *   endsLabel: string,
 *   priceValue: number|null,
 *   currency: string,
 * }}
 */
function presentationFromCachedConfig(productId, optionId) {
  const empty = emptyPresentation();
  if (!productId) return empty;

  const config = peekCachedSubscriptionConfig(productId);
  if (!config) return empty;

  const plans = /** @type {Record<string, { title?: string }>|undefined} */ (
    config.planOptions?.[productId]
  ) || {};
  const plan = plans[optionId];
  const details = /** @type {Record<string, any>} */ (
    config.subscriptionDetails?.[optionId]?.[productId] || {}
  );
  const finalPrice = config.regularPrices?.options?.[optionId]?.[productId]?.finalPrice;
  const regularAmount = Number(details.regular_payment?.finalAmount);
  const firstAmount = Number(details.first_payment?.finalAmount);
  let priceValue = null;
  if (Number.isFinite(firstAmount)) {
    priceValue = firstAmount;
  } else if (Number.isFinite(regularAmount)) {
    priceValue = regularAmount;
  }

  return {
    planLabel: typeof plan?.title === 'string' ? plan.title.trim() : '',
    period: finalPrice?.aw_period ? parseSubscriptionPeriod(finalPrice.aw_period) : null,
    startDate: typeof details.subscription_starts?.value === 'string'
      ? details.subscription_starts.value
      : '',
    endsLabel: typeof details.subscription_ends?.value === 'string'
      ? details.subscription_ends.value
      : '',
    priceValue,
    currency: '',
  };
}
