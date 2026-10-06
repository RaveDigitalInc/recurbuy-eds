import { SUBSCRIPTION_ERROR_CODES } from '../contract.js';
import { getValidSubscriptionConfig, getSubscriptionTimeoutMs } from '../config.js';
import { mapStorefrontPayloadToEligibility } from './storefront-pdp-mapper.js';
import { fetchSubscriptionOptionList } from './storefront-options-list.js';

/**
 * @param {import('../contract.js').SubscriptionEligibilityRequest} request
 * @returns {Promise<import('../contract.js').SubscriptionEligibilityResponse>}
 */
export async function fetchEligibility(request) {
  const productId = request?.product?.externalId || request?.productId;
  if (!productId) {
    return {
      error: {
        code: SUBSCRIPTION_ERROR_CODES.INVALID_REQUEST,
        message: 'Product ID (externalId) is required to fetch subscription eligibility.',
      },
    };
  }

  let config;
  try {
    config = getValidSubscriptionConfig();
  } catch (err) {
    return {
      error: {
        code: SUBSCRIPTION_ERROR_CODES.INVALID_REQUEST,
        message: err.message,
      },
    };
  }

  const url = new URL(
    `/api/recurbuy/storefront/products/${encodeURIComponent(productId)}/subscription-config`,
    config.storefrontUrl,
  );
  url.searchParams.append('store_id', config.storeId);
  if (config.websiteId) {
    url.searchParams.append('website_id', config.websiteId);
  }

  if (request.subscriptionOptionId) {
    url.searchParams.append('subscription_option_id', request.subscriptionOptionId);
  }

  if (request.context === 'edit_item') {
    url.searchParams.append('context', 'edit_item');
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

    if (response.status === 404) {
      return {
        error: {
          code: SUBSCRIPTION_ERROR_CODES.NOT_FOUND,
          message: 'Subscription configuration not found for this product.',
        },
      };
    }

    if (response.status === 422) {
      return {
        error: {
          code: SUBSCRIPTION_ERROR_CODES.NOT_ELIGIBLE,
          message: `Product ${productId} is not eligible for subscriptions.`,
        },
      };
    }

    if (!response.ok) {
      return {
        error: {
          code: SUBSCRIPTION_ERROR_CODES.SERVER,
          message: `Storefront API returned status ${response.status}.`,
        },
      };
    }

    const payload = await response.json();
    const optionList = await fetchSubscriptionOptionList(productId);
    const eligibility = mapStorefrontPayloadToEligibility(
      payload,
      request.sku || String(productId),
      request.product,
      optionList,
    );

    if (!eligibility.eligible) {
      return {
        error: {
          code: SUBSCRIPTION_ERROR_CODES.NOT_FOUND,
          message: `No subscription plans available for product ${productId}.`,
        },
      };
    }

    return { data: eligibility };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      error: {
        code: SUBSCRIPTION_ERROR_CODES.NETWORK,
        message: aborted ? 'Request timed out.' : 'Unable to reach the Subscription Storefront API.',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
