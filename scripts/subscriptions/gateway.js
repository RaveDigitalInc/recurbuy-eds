import { fetchEligibility } from './adapters/dummy-json-adapter.js';
import { SUBSCRIPTION_ERROR_CODES } from './contract.js';
import { resolveFixtureCartDetails } from './fixtures/index.js';

/**
 * @typedef {import('./contract.js').SubscriptionEligibilityRequest}
 *   SubscriptionEligibilityRequest
 * @typedef {import('./contract.js').SubscriptionEligibilityResponse}
 *   SubscriptionEligibilityResponse
 * @typedef {import('./contract.js').CartSubscriptionDetailsRequest}
 *   CartSubscriptionDetailsRequest
 * @typedef {import('./contract.js').CartSubscriptionDetailsResponse}
 *   CartSubscriptionDetailsResponse
 */

/**
 * Gateway for subscription eligibility and cart details.
 * Swap the adapter implementation when the SaaS API is ready.
 */
export const SubscriptionGateway = {
  /**
   * @param {SubscriptionEligibilityRequest} request
   * @returns {Promise<SubscriptionEligibilityResponse>}
   */
  getEligibility: fetchEligibility,

  /**
   * @param {CartSubscriptionDetailsRequest} request
   * @returns {Promise<CartSubscriptionDetailsResponse>}
   */
  async getCartSubscriptionDetails(request) {
    if (!request?.sku) {
      return {
        error: {
          code: SUBSCRIPTION_ERROR_CODES.INVALID_REQUEST,
          message: 'SKU is required to fetch cart subscription details.',
        },
      };
    }

    const data = resolveFixtureCartDetails(
      request.sku,
      request.planId,
      request.parentSku,
    );
    if (!data) {
      return {
        error: {
          code: SUBSCRIPTION_ERROR_CODES.NOT_FOUND,
          message: `No subscription details found for SKU ${request.sku}.`,
        },
      };
    }

    return { data };
  },
};
