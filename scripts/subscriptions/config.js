import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @returns {'local'|'remote'}
 */
export function getSubscriptionDataSource() {
  const source = getConfigValue('subscriptions-data-source');
  if (source === 'remote') return 'remote';
  return 'local';
}

/**
 * @returns {string|undefined}
 */
export function getSubscriptionEndpoint() {
  return getConfigValue('subscriptions-endpoint');
}

/**
 * @returns {'GET'|'POST'}
 */
export function getSubscriptionFetchMethod() {
  const method = getConfigValue('subscriptions-fetch-method');
  return method === 'POST' ? 'POST' : 'GET';
}

/**
 * @returns {number}
 */
export function getSubscriptionTimeoutMs() {
  const timeout = Number(getConfigValue('subscriptions-timeout-ms'));
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
}

/**
 * @returns {boolean}
 */
export function shouldUseLocalFixtures() {
  return getSubscriptionDataSource() === 'local' || !getSubscriptionEndpoint();
}
