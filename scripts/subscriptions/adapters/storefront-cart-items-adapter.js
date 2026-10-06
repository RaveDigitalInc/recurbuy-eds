import { getValidSubscriptionConfig, getSubscriptionTimeoutMs } from '../config.js';

/**
 * Fetches per-line subscription flags from the RecurBuy storefront checkout API.
 * Soft-fails: returns null on missing config, network errors, or non-OK responses.
 *
 * @param {string|undefined|null} cartId Guest mask or numeric Commerce cart id
 * @returns {Promise<Array<Record<string, unknown>>|null>}
 */
export async function fetchCheckoutCartItemFlags(cartId) {
  const normalizedCartId = typeof cartId === 'string' ? cartId.trim() : '';
  if (!normalizedCartId) {
    return null;
  }

  let config;
  try {
    config = getValidSubscriptionConfig();
  } catch {
    return null;
  }

  const url = new URL('/api/recurbuy/storefront/checkout/cart-items', config.storefrontUrl);
  url.searchParams.set('cart_id', normalizedCartId);
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
    const items = payload?.items;
    return Array.isArray(items) ? items : [];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
