import { PRODUCT_FIXTURES } from './products.js';

/**
 * @param {import('../contract.js').SubscriptionEligibilityRequest} request
 * @returns {import('../contract.js').SubscriptionEligibility|undefined}
 */
export function resolveFixtureEligibility(request) {
  const { sku, parentSku } = request;
  const catalog = PRODUCT_FIXTURES;

  if (catalog[sku]) {
    return cloneEligibility(catalog[sku], request);
  }

  if (parentSku && catalog[parentSku]) {
    return cloneEligibility(catalog[parentSku], { ...request, sku: parentSku });
  }

  return undefined;
}

/**
 * @param {string} sku
 * @param {string} [planId]
 * @param {string} [parentSku]
 * @returns {import('../contract.js').CartSubscriptionDetails|undefined}
 */
export function resolveFixtureCartDetails(sku, planId, parentSku) {
  const eligibility = PRODUCT_FIXTURES[sku]
    || (parentSku ? PRODUCT_FIXTURES[parentSku] : undefined);
  if (!eligibility?.eligible) return undefined;

  const selectedPlanId = planId || eligibility.selectedPlanId;
  const plan = eligibility.plans.find((entry) => entry.id === selectedPlanId);
  if (!plan) return undefined;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);

  return {
    planId: plan.id,
    planLabel: plan.label,
    period: plan.period,
    price: plan.prices.initial || plan.prices.regular,
    startDate: startDate.toISOString().slice(0, 10),
    purchaseType: 'subscription',
  };
}

/**
 * @param {import('../contract.js').SubscriptionEligibility} eligibility
 * @param {import('../contract.js').SubscriptionEligibilityRequest} request
 * @returns {import('../contract.js').SubscriptionEligibility}
 */
function cloneEligibility(eligibility, request) {
  const resolvedSku = request.sku || eligibility.sku;

  return {
    ...eligibility,
    sku: resolvedSku,
    parentSku: request.parentSku || eligibility.parentSku,
    productType: request.productType || eligibility.productType,
    selectedPlanId: eligibility.selectedPlanId
      || eligibility.plans[0]?.id,
  };
}
