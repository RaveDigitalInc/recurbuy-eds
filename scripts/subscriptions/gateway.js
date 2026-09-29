import { fetchEligibility } from './adapters/storefront-adapter.js';

/**
 * @typedef {import('./contract.js').SubscriptionEligibilityRequest}
 *   SubscriptionEligibilityRequest
 * @typedef {import('./contract.js').SubscriptionEligibilityResponse}
 *   SubscriptionEligibilityResponse
 */

/**
 * Gateway for subscription eligibility.
 * Connects directly to the RecurBuy Storefront SaaS API.
 */
export const SubscriptionGateway = {
  /**
   * @param {SubscriptionEligibilityRequest} request
   * @returns {Promise<SubscriptionEligibilityResponse>}
   */
  getEligibility: fetchEligibility,
};