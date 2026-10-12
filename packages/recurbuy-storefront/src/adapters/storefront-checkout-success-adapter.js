import { getValidSubscriptionConfig, getSubscriptionTimeoutMs } from '../config.js';
import { mapStorefrontCheckoutSuccessPayload } from './storefront-checkout-success-mapper.js';

/**
 * @typedef {Object} FetchCheckoutSuccessProfilesRequest
 * @property {number|string|undefined|null} [orderId] Commerce sales order entity id
 * @property {string|undefined|null} [incrementId] Commerce sales order increment id
 */

/**
 * Fetches subscription profiles for the checkout success page.
 * Soft-fails: returns null on missing config, bad request, network, or non-OK HTTP.
 *
 * @param {FetchCheckoutSuccessProfilesRequest} request
 * @returns {Promise<import('./storefront-checkout-success-mapper.js')
 *   .StorefrontCheckoutSuccessProfiles|null>}
 */
export async function fetchCheckoutSuccessProfiles(request = {}) {
  const orderId = normalizeOrderId(request.orderId);
  const incrementId = typeof request.incrementId === 'string' ? request.incrementId.trim() : '';

  if (orderId === null && !incrementId) {
    return null;
  }

  let config;
  try {
    config = getValidSubscriptionConfig();
  } catch {
    return null;
  }

  const url = new URL('/api/recurbuy/storefront/checkout/success', config.storefrontUrl);
  if (orderId !== null) {
    url.searchParams.set('order_id', String(orderId));
  }
  if (incrementId) {
    url.searchParams.set('increment_id', incrementId);
  }
  url.searchParams.set('store_id', config.storeId);
  if (config.websiteId) {
    url.searchParams.set('website_id', config.websiteId);
  }

  const controller = new AbortController();
  const timeoutMs = getSubscriptionTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'X-RecurBuy-Connection-Token': config.connectionToken,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return mapStorefrontCheckoutSuccessPayload(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {number|string|undefined|null} raw
 * @returns {number|null}
 */
function normalizeOrderId(raw) {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return raw;
  }

  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const parsed = parseInt(raw.trim(), 10);
    return parsed > 0 ? parsed : null;
  }

  return null;
}
