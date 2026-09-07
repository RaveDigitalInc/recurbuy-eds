/**
 * Local subscription mock for simple-first PDP (Luna Mini Pouch).
 * Prices are display-only until Recurbuy SaaS is wired.
 */

/** @type {import('../contract.js').SubscriptionEligibility} */
const lunaMiniPouch = {
  sku: 'luna',
  productType: 'simple',
  eligible: true,
  allowOneTime: true,
  defaultPurchaseType: 'subscription',
  selectedPlanId: 'luna-monthly',
  plans: [
    {
      id: 'luna-monthly',
      label: 'Every month',
      period: { value: 1, unit: 'month' },
      discount: { type: 'percent', value: 10 },
      prices: {
        regular: { value: 45.0, currency: 'USD' },
        initial: { value: 40.5, currency: 'USD' },
      },
      description: 'Luna Mini Pouch monthly delivery.',
    },
    {
      id: 'luna-quarterly',
      label: 'Every 3 months',
      period: { value: 3, unit: 'month' },
      discount: { type: 'percent', value: 15 },
      prices: {
        regular: { value: 45.0, currency: 'USD' },
        initial: { value: 38.25, currency: 'USD' },
      },
    },
  ],
};

/**
 * @type {Record<string, import('../contract.js').SubscriptionEligibility>}
 */
export const PRODUCT_FIXTURES = {
  luna: lunaMiniPouch,
};
