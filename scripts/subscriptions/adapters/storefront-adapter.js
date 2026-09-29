import { SUBSCRIPTION_ERROR_CODES } from '../contract.js';
import { getValidSubscriptionConfig, getSubscriptionTimeoutMs } from '../config.js';
import { mapStorefrontPayloadToEligibility } from './storefront-pdp-mapper.js';

/*
 * Запрашивает доступность подписки для товара PDP
 * 
 * @param {import('../contract.js').SubscriptionEligibilityRequest & { product?: { externalId?: string }, initialSelection?: any, subscriptionOptionId?: string }} request
 * @returns {Promise<import('../contract.js').SubscriptionEligibilityResponse>}
 */
export async function fetchEligibility(request) {
  // 1. Определение product_id через externalId (Adobe Magento ID)
  const productId = request?.product?.externalId || request?.productId;
  if (!productId) {
    return {
      error: {
        code: SUBSCRIPTION_ERROR_CODES.INVALID_REQUEST,
        message: 'Product ID (externalId) is required to fetch subscription eligibility.',
      },
    };
  }

  // 2. Получение и проверка конфигурации
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

  // 3. Формирование URL и Query-параметров
  const url = new URL(
    `/api/recurbuy/storefront/products/${encodeURIComponent(productId)}/subscription-config`,
    config.storefrontUrl
  );
  url.searchParams.append('store_id', config.storeId);
  if (config.websiteId) {
    url.searchParams.append('website_id', config.websiteId);
  }

  if (request.subscriptionOptionId) {
    url.searchParams.append('subscription_option_id', request.subscriptionOptionId);
  }

  if (request.initialSelection?.subscriptionOptionId || request.context === 'edit_item') {
    url.searchParams.append('context', 'edit_item');
  }

  // 4. Отправка сетевого запроса с таймаутом
  const controller = new AbortController();
  const timeoutMs = getSubscriptionTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-RecurBuy-Connection-Token': config.connectionToken,
      },
      signal: controller.signal,
    });

    // 5. Обработка ошибок ответов сервера
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
    const eligibility = mapStorefrontPayloadToEligibility(payload, request.sku || String(productId), request.product);

    // Если у товара нет подходящих опций подписки, считаем его SUBSCRIPTION_NOT_FOUND
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