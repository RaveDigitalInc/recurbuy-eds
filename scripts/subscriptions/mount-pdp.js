import { events } from '@dropins/tools/event-bus.js';
import * as pdpApi from '@dropins/storefront-pdp/api.js';
import { SubscriptionGateway } from './gateway.js';
import { SUBSCRIPTION_ERROR_CODES } from './contract.js';
import {
  clearSubscriptionPriceBox,
  renderSubscriptionPriceBox,
} from './subscription-price-box.js';
import {
  clearSubscriptionSelector,
  renderSubscriptionSelector,
} from './subscription-selector.js';

/**
 * @typedef {import('./contract.js').SubscriptionEligibility} SubscriptionEligibility
 * @typedef {import('./contract.js').SubscriptionSelection} SubscriptionSelection
 * @typedef {import('./contract.js').SubscriptionError} SubscriptionError
 * @typedef {import('./contract.js').MoneyAmount} MoneyAmount
 * @typedef {import('@dropins/storefront-pdp/data/models/product-model').ProductModel} ProductModel
 * @typedef {import('@dropins/storefront-pdp/data/models/values-model').ValuesModel} ValuesModel
 */

/**
 * @typedef {Object} SubscriptionPdpController
 * @property {() => SubscriptionSelection} getSelection
 * @property {() => boolean} isSelectionValid
 * @property {() => boolean} isActive
 * @property {() => void} destroy
 */

/**
 * Mounts subscription selector + price box and reacts to PDP events.
 * @param {{
 *   selectorRoot: HTMLElement,
 *   priceRoot: HTMLElement,
 *   productPriceRoot?: HTMLElement|null,
 *   onChange?: (selection: SubscriptionSelection, meta: {
 *     active: boolean,
 *     selectionValid: boolean,
 *     productValid: boolean,
 *   }) => void,
 * }} options
 * @returns {SubscriptionPdpController}
 */
export function mountSubscriptionOnPdp({
  selectorRoot,
  priceRoot,
  productPriceRoot = null,
  onChange,
}) {
  /** @type {SubscriptionEligibility|null} */
  let eligibility = null;
  /** @type {SubscriptionError|null} */
  let error = null;
  /** @type {SubscriptionSelection} */
  let selection = { purchaseType: 'one_time' };
  /** @type {'idle'|'loading'|'ready'|'unavailable'|'error'|'hidden'} */
  let viewState = 'idle';
  let productValid = true;
  let requestSeq = 0;
  let destroyed = false;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let debounceTimer = null;

  const notify = () => {
    onChange?.(getSelection(), {
      active: isActive(),
      selectionValid: isSelectionValid(),
      productValid,
    });
  };

  const setProductPriceVisibility = (showSubscriptionPrice) => {
    if (!productPriceRoot) return;
    productPriceRoot.hidden = showSubscriptionPrice;
  };

  const getStandardPrices = () => {
    const product = /** @type {ProductModel|null} */ (events.lastPayload('pdp/data') ?? null);
    return {
      standardPrice: toMoney(product?.prices?.final),
      standardRegularPrice: toMoney(product?.prices?.regular),
    };
  };

  const render = () => {
    if (destroyed) return;

    if (viewState === 'hidden' || viewState === 'idle') {
      clearSubscriptionSelector(selectorRoot);
      clearSubscriptionPriceBox(priceRoot);
      setProductPriceVisibility(false);
      notify();
      return;
    }

    const selectedPlan = eligibility?.plans?.find((plan) => plan.id === selection.planId)
      || eligibility?.plans?.[0]
      || null;

    renderSubscriptionSelector(selectorRoot, {
      viewState: viewState === 'ready' ? 'ready' : viewState,
      eligibility,
      selection,
      error,
      productValid,
      onPurchaseTypeChange: (purchaseType) => {
        selection = {
          ...selection,
          purchaseType,
          planId: undefined,
        };
        render();
      },
      onPlanChange: (planId) => {
        selection = {
          ...selection,
          purchaseType: 'subscription',
          planId,
        };
        render();
      },
      onCustomOptionChange: (code, value) => {
        selection = {
          ...selection,
          customOptionValues: {
            ...(selection.customOptionValues || {}),
            [code]: value,
          },
        };
        render();
      },
    });

    if (viewState === 'ready') {
      const { standardPrice, standardRegularPrice } = getStandardPrices();
      renderSubscriptionPriceBox(priceRoot, {
        purchaseType: selection.purchaseType,
        plan: selection.purchaseType === 'subscription' ? selectedPlan : null,
        standardPrice,
        standardRegularPrice,
      });
      setProductPriceVisibility(true);
    } else {
      clearSubscriptionPriceBox(priceRoot);
      setProductPriceVisibility(false);
    }

    notify();
  };

  const applyEligibilityResponse = (response) => {
    if (response.error) {
      if (response.error.code === SUBSCRIPTION_ERROR_CODES.NOT_FOUND) {
        eligibility = null;
        error = null;
        selection = { purchaseType: 'one_time' };
        viewState = 'hidden';
        render();
        return;
      }

      eligibility = null;
      error = response.error;
      selection = { purchaseType: 'one_time' };
      viewState = 'error';
      render();
      return;
    }

    eligibility = response.data || null;
    error = null;

    if (!eligibility) {
      viewState = 'hidden';
      selection = { purchaseType: 'one_time' };
      render();
      return;
    }

    if (!eligibility.eligible || !eligibility.plans?.length) {
      viewState = 'unavailable';
      selection = { purchaseType: 'one_time' };
      render();
      return;
    }

    const defaultPurchaseType = eligibility.allowOneTime === false
      ? 'subscription'
      : (eligibility.defaultPurchaseType || 'one_time');
    const defaultPlanId = eligibility.selectedPlanId || eligibility.plans[0].id;
    const keepPlan = eligibility.plans.some((plan) => plan.id === selection.planId);

    if (!keepPlan) {
      selection = {
        purchaseType: defaultPurchaseType,
        planId: defaultPurchaseType === 'subscription' ? defaultPlanId : undefined,
        customOptionValues: {},
      };
    } else if (eligibility.allowOneTime === false) {
      selection = {
        ...selection,
        purchaseType: 'subscription',
        planId: selection.planId || defaultPlanId,
      };
    }

    viewState = 'ready';
    render();
  };

  const refreshEligibility = async () => {
    const product = /** @type {ProductModel|null} */ (events.lastPayload('pdp/data') ?? null);
    const values = /** @type {ValuesModel|null} */ (
      pdpApi.getProductConfigurationValues() || events.lastPayload('pdp/values') || null
    );

    if (!product?.sku) {
      viewState = 'hidden';
      render();
      return;
    }

    const request = buildEligibilityRequest(product, values);
    requestSeq += 1;
    const seq = requestSeq;
    viewState = 'loading';
    render();

    const response = await SubscriptionGateway.getEligibility(request);
    if (destroyed || seq !== requestSeq) return;
    applyEligibilityResponse(response);
  };

  const scheduleRefresh = () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      refreshEligibility();
    }, 150);
  };

  const onValid = (valid) => {
    productValid = Boolean(valid);
    render();
  };

  const dataListener = events.on('pdp/data', () => {
    scheduleRefresh();
  }, { eager: true });

  const valuesListener = events.on('pdp/values', () => {
    scheduleRefresh();
  }, { eager: true });

  const validListener = events.on('pdp/valid', onValid, { eager: true });

  function getSelection() {
    if (!isActive() || selection.purchaseType !== 'subscription') {
      return { purchaseType: 'one_time' };
    }

    return {
      purchaseType: 'subscription',
      planId: selection.planId,
      customOptionValues: { ...(selection.customOptionValues || {}) },
    };
  }

  function isActive() {
    return viewState === 'ready' && Boolean(eligibility?.eligible);
  }

  function isSelectionValid() {
    if (!isActive() || selection.purchaseType !== 'subscription') {
      return true;
    }

    if (!selection.planId) return false;

    const requiredOptions = (eligibility?.customOptions || []).filter((option) => option.required);
    return requiredOptions.every((option) => {
      const value = selection.customOptionValues?.[option.code];
      return Boolean(value && String(value).trim());
    });
  }

  function destroy() {
    destroyed = true;
    if (debounceTimer) window.clearTimeout(debounceTimer);
    dataListener?.off?.();
    valuesListener?.off?.();
    validListener?.off?.();
    clearSubscriptionSelector(selectorRoot);
    clearSubscriptionPriceBox(priceRoot);
    setProductPriceVisibility(false);
  }

  return {
    getSelection,
    isSelectionValid,
    isActive,
    destroy,
  };
}

/**
 * @param {ProductModel} product
 * @param {ValuesModel|null} values
 * @returns {import('./contract.js').SubscriptionEligibilityRequest}
 */
function buildEligibilityRequest(product, values) {
  const parentSku = product.sku;
  const sku = values?.sku || product.variantSku || product.sku;

  return {
    sku,
    parentSku: sku !== parentSku ? parentSku : undefined,
    productType: resolveProductType(product),
    quantity: values?.quantity,
    optionsUIDs: values?.optionsUIDs,
  };
}

/**
 * @param {ProductModel} product
 * @returns {import('./contract.js').ProductType}
 */
function resolveProductType(product) {
  // 1. Bundle Product
  if (product.isBundle || product.__typename === 'BundleProduct') {
    return 'bundle';
  }

  // 2. Grouped Product
  const hasGroupedItems = Array.isArray(product.options)
    && product.options.some((option) => option.typename === 'ProductViewOptionValueProduct');

  if (hasGroupedItems || product.__typename === 'GroupedProduct') {
    return 'grouped';
  }

  // 3. Configurable Product (наличие сгенерированного variantSku или массива вариантов/атрибутов)
  const isConfigurable = Boolean(product.variantSku)
    || product.__typename === 'ConfigurableProduct'
    || (Array.isArray(product.variants) && product.variants.length > 0);

  if (isConfigurable) {
    return 'configurable';
  }

  // 4. Fallback -> Simple
  return 'simple';
}

/**
 * @param {{
 *   amount?: number,
 *   currency?: string,
 *   minimumAmount?: number,
 *   maximumAmount?: number,
 * }|null|undefined} price
 * @returns {MoneyAmount|null}
 */
function toMoney(price) {
  if (!price) return null;

  let value = null;
  if (typeof price.amount === 'number') {
    value = price.amount;
  } else if (typeof price.minimumAmount === 'number') {
    value = price.minimumAmount;
  }

  if (value === null) return null;
  return {
    value,
    currency: price.currency || 'USD',
  };
}