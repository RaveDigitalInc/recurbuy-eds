import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @returns {string|undefined}
 */
export function getSubscriptionStorefrontUrl() {
  const url = getConfigValue('subscriptions-storefront-url');
  return url?.trim() ? url.trim().replace(/\/$/, '') : undefined;
}

/**
 * @returns {string|undefined}
 */
export function getSubscriptionConnectionToken() {
  const token = getConfigValue('subscriptions-connection-token');
  return token?.trim() ? token.trim() : undefined;
}

/**
 * @returns {string|undefined}
 */
export function getSubscriptionStoreId() {
  const storeId = getConfigValue('subscriptions-store-id');
  return storeId?.trim() ? storeId.trim() : undefined;
}

/**
 * @returns {string|undefined}
 */
export function getSubscriptionWebsiteId() {
  const websiteId = getConfigValue('subscriptions-website-id');
  return websiteId?.trim() ? websiteId.trim() : undefined;
}

/**
 * @returns {number}
 */
export function getSubscriptionTimeoutMs() {
  const timeout = Number(getConfigValue('subscriptions-timeout-ms'));
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
}

/**
 * Throws when URL, token, or store id is missing.
 *
 * @returns {{
 *   storefrontUrl: string,
 *   connectionToken: string,
 *   storeId: string,
 *   websiteId?: string,
 * }}
 * @throws {Error}
 */
export function getValidSubscriptionConfig() {
  const storefrontUrl = getSubscriptionStorefrontUrl();
  const connectionToken = getSubscriptionConnectionToken();
  const storeId = getSubscriptionStoreId();
  const websiteId = getSubscriptionWebsiteId();

  if (!storefrontUrl || !connectionToken || !storeId) {
    const missing = [];
    if (!storefrontUrl) missing.push('subscriptions-storefront-url');
    if (!connectionToken) missing.push('subscriptions-connection-token');
    if (!storeId) missing.push('subscriptions-store-id');

    throw new Error(`[Subscriptions Selector Error] Invalid configuration: Missing or empty required keys: ${missing.join(', ')}`);
  }

  return {
    storefrontUrl,
    connectionToken,
    storeId,
    ...(websiteId && { websiteId }),
  };
}
