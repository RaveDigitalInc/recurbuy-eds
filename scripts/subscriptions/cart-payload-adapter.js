import { SUBSCRIPTION_CUSTOM_FIELD_KEY } from './contract.js';

/**
 * @typedef {import('./contract.js').SubscriptionSelection} SubscriptionSelection
 * @typedef {import('@dropins/storefront-pdp/data/models/values-model').ValuesModel} ValuesModel
 */

/**
 * Merges Adobe PDP cart item values with subscription metadata for add-to-cart.
 * Keeps Commerce cart mutation shape stable while the backend contract evolves.
 */
export const CartPayloadAdapter = {
  /**
   * @param {ValuesModel|null|undefined} configurationValues
   * @param {SubscriptionSelection|null|undefined} selection
   * @returns {ValuesModel & { customFields?: Record<string, unknown> }}
   */
  enrich(configurationValues, selection) {
    if (!configurationValues) {
      throw new Error('Product configuration values are required.');
    }

    if (!selection || selection.purchaseType === 'one_time') {
      return { ...configurationValues };
    }

    if (!selection.planId) {
      throw new Error('Subscription plan ID is required for subscription purchase.');
    }

    return {
      ...configurationValues,
      customFields: {
        [SUBSCRIPTION_CUSTOM_FIELD_KEY]: {
          purchaseType: selection.purchaseType,
          planId: selection.planId,
          customOptionValues: selection.customOptionValues || {},
        },
      },
    };
  },

  /**
   * @param {Record<string, unknown>|undefined|null} customFields
   * @returns {SubscriptionSelection|null}
   */
  parseCustomFields(customFields) {
    const subscription = customFields?.[SUBSCRIPTION_CUSTOM_FIELD_KEY];
    if (!subscription || typeof subscription !== 'object') {
      return null;
    }

    const payload = /** @type {Record<string, unknown>} */ (subscription);

    if (payload.purchaseType !== 'subscription') {
      return { purchaseType: 'one_time' };
    }

    return {
      purchaseType: 'subscription',
      planId: typeof payload.planId === 'string' ? payload.planId : undefined,
      customOptionValues: /** @type {Record<string, string>|undefined} */ (
        payload.customOptionValues
      ),
    };
  },
};
