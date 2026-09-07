import { SUBSCRIPTION_ERROR_CODES } from '../contract.js';
import { resolveFixtureEligibility } from '../fixtures/index.js';

/**
 * @typedef {import('../contract.js').SubscriptionEligibilityRequest}
 *   SubscriptionEligibilityRequest
 * @typedef {import('../contract.js').SubscriptionEligibilityResponse}
 *   SubscriptionEligibilityResponse
 */

/**
 * Local fixture lookup until Recurbuy SaaS is wired.
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
