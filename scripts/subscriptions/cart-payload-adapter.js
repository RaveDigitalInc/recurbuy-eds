import { SUBSCRIPTION_CUSTOM_FIELD_KEY } from './contract.js';
import { saveSelectionForSku } from './selection-store.js';

/**
 * @typedef {import('./contract.js').SubscriptionSelection} SubscriptionSelection
 * @typedef {import('@dropins/storefront-pdp/data/models/values-model').ValuesModel} ValuesModel
 */

/**
 * Merges Adobe PDP cart item values with subscription metadata for add-to-cart.
 */
export const CartPayloadAdapter = {
  /**
   * @param {ValuesModel|null|undefined} configurationValues
   * @param {SubscriptionSelection|null|undefined} selection
   * @param {{ parentSku?: string, selectedPlan?: import('./contract.js').SubscriptionPlan }} [options]
   * @returns {ValuesModel & { parentSku?: string }}
   */
  enrich(configurationValues, selection, options = {}) {
    if (!configurationValues) {
      throw new Error('Product configuration values are required.');
    }

    const { sku } = configurationValues;
    const { parentSku: valuesParentSku } = /** @type {{ parentSku?: string }} */ (
      configurationValues
    );
    const parentSku = options.parentSku || valuesParentSku;
    const base = { ...configurationValues };

    if (parentSku && parentSku !== sku) {
      base.parentSku = parentSku;
    }

    if (!selection || selection.purchaseType === 'one_time') {
      saveSelectionForSku(sku, { purchaseType: 'one_time' });
      if (parentSku && parentSku !== sku) {
        saveSelectionForSku(parentSku, { purchaseType: 'one_time' });
      }
      return base;
    }

    if (!selection.planId) {
      throw new Error('Subscription plan ID is required for subscription purchase.');
    }

    // Формируем planSnapshot, если выбранный план передан в опциях или присутствует в selection
    const plan = options.selectedPlan;
    const enrichedSelection = {
      ...selection,
      planSnapshot: selection.planSnapshot || (plan ? {
        planLabel: plan.label,
        period: plan.period,
        price: plan.prices?.initial || plan.prices?.regular,
      } : undefined),
    };

    saveSelectionForSku(sku, enrichedSelection);
    if (parentSku && parentSku !== sku) {
      saveSelectionForSku(parentSku, enrichedSelection);
    }

    return base;
  },

  /**
   * Builds the future cart mutation customFields payload.
   * @param {SubscriptionSelection|null|undefined} selection
   * @returns {Record<string, unknown>|undefined}
   */
  toCustomFields(selection) {
    if (!selection || selection.purchaseType !== 'subscription' || !selection.planId) {
      return undefined;
    }

    return {
      [SUBSCRIPTION_CUSTOM_FIELD_KEY]: {
        purchaseType: selection.purchaseType,
        planId: selection.planId,
        customOptionValues: selection.customOptionValues || {},
        ...(selection.planSnapshot && { planSnapshot: selection.planSnapshot }),
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
      planSnapshot: typeof payload.planSnapshot === 'object' ? payload.planSnapshot : undefined,
    };
  },
};