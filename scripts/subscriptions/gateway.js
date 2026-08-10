import { fetchEligibility } from './adapters/dummy-json-adapter.js';
import { SUBSCRIPTION_ERROR_CODES } from './contract.js';
import { resolveFixtureCartDetails } from './fixtures/index.js';
import { shouldUseLocalFixtures } from './config.js';

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

    if (shouldUseLocalFixtures()) {
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
    }

    const eligibilityResponse = await fetchEligibility({
      sku: request.sku,
      productType: 'simple',
    });

    if (eligibilityResponse.error || !eligibilityResponse.data) {
      return {
        error: eligibilityResponse.error || {
          code: SUBSCRIPTION_ERROR_CODES.NOT_FOUND,
          message: `No subscription details found for SKU ${request.sku}.`,
        },
      };
    }

    const planId = request.planId || eligibilityResponse.data.selectedPlanId;
    const plan = eligibilityResponse.data.plans.find((entry) => entry.id === planId);

    if (!plan) {
      return {
        error: {
          code: SUBSCRIPTION_ERROR_CODES.NOT_FOUND,
          message: `Subscription plan ${planId} was not found.`,
        },
      };
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);

    return {
      data: {
        planId: plan.id,
        planLabel: plan.label,
        period: plan.period,
        price: plan.prices.initial || plan.prices.regular,
        startDate: startDate.toISOString().slice(0, 10),
        purchaseType: 'subscription',
      },
    };
  },
};
