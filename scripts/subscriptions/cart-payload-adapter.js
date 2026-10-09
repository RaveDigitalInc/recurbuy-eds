import { RECURBUY_SUBSCRIPTION_OPTION_ID } from './contract.js';
import { saveSelectionForSku } from './selection-store.js';

/**
 * @typedef {import('./contract.js').SubscriptionSelection} SubscriptionSelection
 * @typedef {import('@dropins/storefront-pdp/data/models/values-model').ValuesModel} ValuesModel
 * @typedef {{ uid: string, value: string }} EnteredOption
 */

/**
 * Normalizes input entered options into an array of EnteredOption objects.
 *
 * @param {unknown} enteredOptions
 * @returns {EnteredOption[]}
 */
function asEnteredOptionsList(enteredOptions) {
  if (Array.isArray(enteredOptions)) {
    return enteredOptions
      .filter((option) => option && typeof option === 'object' && option.uid)
      .map((option) => ({
        uid: String(option.uid),
        value: String(option.value ?? ''),
      }));
  }

  if (enteredOptions && typeof enteredOptions === 'object') {
    return Object.entries(enteredOptions).map(([uid, value]) => ({
      uid,
      value: String(value ?? ''),
    }));
  }

  return [];
}

/**
 * Checks whether an entered option is a legacy/fake RecurBuy subscription marker.
 *
 * @param {EnteredOption} option
 * @returns {boolean}
 */
function isRecurbuySubscriptionMarker(option) {
  const uid = option?.uid;
  if (!uid) return false;
  if (uid === RECURBUY_SUBSCRIPTION_OPTION_ID) return true;
  try {
    return atob(uid) === `custom-option/${RECURBUY_SUBSCRIPTION_OPTION_ID}`;
  } catch {
    return false;
  }
}

/**
 * Filters out legacy RecurBuy subscription markers, returning only genuine catalog options.
 * AccS rejects non-catalog option UIDs in GraphQL entered_options.
 *
 * @param {unknown} enteredOptions
 * @returns {EnteredOption[]}
 */
function withoutSubscriptionMarker(enteredOptions) {
  return asEnteredOptionsList(enteredOptions).filter(
    (option) => !isRecurbuySubscriptionMarker(option),
  );
}

/**
 * Prepares PDP cart item payloads for add-to-cart.
 *
 * On AccS, RecurBuy subscription option IDs must NOT be sent in `enteredOptions`.
 * `enrich` strips any legacy markers from `enteredOptions` and persists the selection
 * in local state (`selection-store`) for UI and client-side tracking.
 */
export const CartPayloadAdapter = {
  /**
   * @param {ValuesModel|null|undefined} configurationValues
   * @param {SubscriptionSelection|null|undefined} selection
   * @param {{
   *   parentSku?: string,
   *   selectedPlan?: import('./contract.js').SubscriptionPlan,
   * }} [options]
   * @returns {ValuesModel & { parentSku?: string, enteredOptions?: EnteredOption[] }}
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

    // Strip out any legacy RecurBuy fake markers from entered options
    const cleanEnteredOptions = withoutSubscriptionMarker(
      configurationValues.enteredOptions,
    );

    if (parentSku && parentSku !== sku) {
      base.parentSku = parentSku;
    }

    if (cleanEnteredOptions.length) {
      base.enteredOptions = cleanEnteredOptions;
    } else {
      delete base.enteredOptions;
    }

    // Save UI selection state
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

    const plan = options.selectedPlan;
    const enrichedSelection = {
      ...selection,
      planSnapshot:
        selection.planSnapshot
        || (plan
          ? {
            planLabel: plan.label,
            period: plan.period,
            price: plan.prices?.initial || plan.prices?.regular,
          }
          : undefined),
    };

    saveSelectionForSku(sku, enrichedSelection);

    return base;
  },
};
