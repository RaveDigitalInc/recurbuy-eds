import { fetchGraphQl } from '@dropins/storefront-cart/api.js';
import { RECURBUY_SUBSCRIPTION_OPTION_ID } from '../contract.js';
import { parseSubscriptionPeriod } from '../format.js';
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
 * Cart-item custom attributes are the quote's subscription marker.
 * sessionStorage is only the tab that added the line.
 *
 * @param {string} cartId
 * @returns {Promise<Map<string, {
 *   optionId: string,
 *   catalogProductId: string,
 *   unitPrice: number|null,
 *   currency: string,
 *   startDate: string,
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
    const optionId = attributeValue(item?.custom_attributes, RECURBUY_SUBSCRIPTION_OPTION_ID);
    if (!uid || !optionId || optionId === '0') return;

    const unitPrice = Number(item?.prices?.price?.value);
    markers.set(uid, {
      optionId,
      catalogProductId: catalogProductId(item),
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
      currency: typeof item?.prices?.price?.currency === 'string'
        ? item.prices.price.currency
        : 'USD',
      startDate: attributeValue(item?.custom_attributes, 'recurbuy_subscription_start_date'),
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
 * }} marker
 * @returns {Promise<import('../contract.js').CartSubscriptionDetails>}
 */
export async function subscriptionDetailsFromQuoteMarker(marker) {
  // Cart must not GET subscription-config per line — that was N parallel identical-looking
  // requests. Price comes from the quote; label/period only from an already-warm PDP cache.
  const presentation = presentationFromCachedConfig(marker.catalogProductId, marker.optionId);
  const priceValue = marker.unitPrice ?? presentation.priceValue;

  return {
    purchaseType: 'subscription',
    planId: marker.optionId,
    subscriptionOptionId: marker.optionId,
    planLabel: presentation.planLabel || `Plan ${marker.optionId}`,
    period: presentation.period || { value: 1, unit: 'month' },
    price: {
      value: Number.isFinite(priceValue) ? priceValue : 0,
      currency: marker.currency || presentation.currency || 'USD',
    },
    ...(marker.startDate || presentation.startDate
      ? { startDate: marker.startDate || presentation.startDate }
      : {}),
    ...(presentation.endsLabel ? { endsLabel: presentation.endsLabel } : {}),
  };
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
  const empty = {
    planLabel: '',
    period: null,
    startDate: '',
    endsLabel: '',
    priceValue: null,
    currency: '',
  };
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
