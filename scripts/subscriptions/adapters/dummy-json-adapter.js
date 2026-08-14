import {
  getSubscriptionEndpoint,
  getSubscriptionFetchMethod,
  getSubscriptionTimeoutMs,
  shouldUseLocalFixtures,
} from '../config.js';
import { SUBSCRIPTION_ERROR_CODES } from '../contract.js';
import { getLocalCatalog, resolveFixtureEligibility } from '../fixtures/index.js';

/**
 * @typedef {import('../contract.js').SubscriptionEligibilityRequest}
 *   SubscriptionEligibilityRequest
 * @typedef {import('../contract.js').SubscriptionEligibilityResponse}
 *   SubscriptionEligibilityResponse
 * @typedef {import('../contract.js').SubscriptionCatalogResponse}
 *   SubscriptionCatalogResponse
 */

/**
 * @param {SubscriptionEligibilityRequest} request
 * @returns {Promise<SubscriptionEligibilityResponse>}
 */
export async function fetchEligibility(request) {
  if (!request?.sku) {
    return {
      error: {
        code: SUBSCRIPTION_ERROR_CODES.INVALID_REQUEST,
        message: 'SKU is required to fetch subscription eligibility.',
      },
    };
  }

  if (shouldUseLocalFixtures()) {
    return resolveLocalEligibility(request);
  }

  try {
    const remoteCatalog = await fetchRemoteCatalog();
    const eligibility = resolveCatalogEligibility(remoteCatalog, request);

    if (!eligibility) {
      return {
        error: {
          code: SUBSCRIPTION_ERROR_CODES.NOT_FOUND,
          message: `No subscription plans found for SKU ${request.sku}.`,
        },
      };
    }

    return { data: eligibility };
  } catch (error) {
    return {
      error: {
        code: SUBSCRIPTION_ERROR_CODES.NETWORK,
        message: error instanceof Error ? error.message : 'Subscription request failed.',
      },
    };
  }
}

/**
 * @param {SubscriptionEligibilityRequest} request
 * @returns {SubscriptionEligibilityResponse}
 */
function resolveLocalEligibility(request) {
  const eligibility = resolveFixtureEligibility(request);

  if (!eligibility) {
    return {
      error: {
        code: SUBSCRIPTION_ERROR_CODES.NOT_FOUND,
        message: `No subscription plans found for SKU ${request.sku}.`,
      },
    };
  }

  return { data: eligibility };
}

/**
 * @returns {Promise<SubscriptionCatalogResponse>}
 */
async function fetchRemoteCatalog() {
  const endpoint = getSubscriptionEndpoint();
  if (!endpoint) {
    return getLocalCatalog();
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), getSubscriptionTimeoutMs());

  try {
    const method = getSubscriptionFetchMethod();
    const response = await fetch(endpoint, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Subscription endpoint returned ${response.status}.`);
    }

    const payload = await response.json();
    return normalizeCatalogResponse(payload);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * @param {unknown} payload
 * @returns {SubscriptionCatalogResponse}
 */
function normalizeCatalogResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Subscription endpoint returned an invalid payload.');
  }

  const { catalog } = /** @type {Record<string, unknown>} */ (payload);
  if (!catalog || typeof catalog !== 'object') {
    throw new Error('Subscription endpoint payload is missing a catalog object.');
  }

  return /** @type {SubscriptionCatalogResponse} */ ({ catalog });
}

/**
 * @param {SubscriptionCatalogResponse} catalogResponse
 * @param {SubscriptionEligibilityRequest} request
 * @returns {import('../contract.js').SubscriptionEligibility|undefined}
 */
function resolveCatalogEligibility(catalogResponse, request) {
  const { catalog } = catalogResponse;
  const directMatch = catalog[request.sku];
  if (directMatch) {
    return {
      ...directMatch,
      sku: request.sku,
      parentSku: request.parentSku || directMatch.parentSku,
      productType: request.productType || directMatch.productType,
    };
  }

  if (request.parentSku && catalog[request.parentSku]) {
    return {
      ...catalog[request.parentSku],
      sku: request.sku,
      parentSku: request.parentSku,
      productType: request.productType || catalog[request.parentSku].productType,
    };
  }

  return undefined;
}
