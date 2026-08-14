/**
 * Test fixtures aligned with Luma demo products.
 * SKUs are placeholders until Magento sandbox catalog is confirmed.
 */

/** @type {import('../contract.js').SubscriptionEligibility} */
const simpleBread = {
  sku: 'RB-BREAD-001',
  productType: 'simple',
  eligible: true,
  allowOneTime: true,
  defaultPurchaseType: 'subscription',
  selectedPlanId: 'bread-weekly',
  plans: [
    {
      id: 'bread-weekly',
      label: 'Every week',
      period: { value: 1, unit: 'week' },
      discount: { type: 'percent', value: 10 },
      prices: {
        regular: { value: 4.49, currency: 'USD' },
        initial: { value: 3.99, currency: 'USD' },
      },
      description: 'Fresh bread delivered weekly.',
    },
    {
      id: 'bread-biweekly',
      label: 'Every 2 weeks',
      period: { value: 2, unit: 'week' },
      discount: { type: 'percent', value: 5 },
      prices: {
        regular: { value: 4.74, currency: 'USD' },
      },
    },
    {
      id: 'bread-monthly',
      label: 'Every month',
      period: { value: 1, unit: 'month' },
      prices: {
        regular: { value: 4.99, currency: 'USD' },
      },
    },
  ],
};

/** @type {import('../contract.js').SubscriptionEligibility} */
const configurableCoffeeLight = {
  sku: 'RB-COFFEE-001-L',
  parentSku: 'RB-COFFEE-001',
  productType: 'configurable',
  eligible: true,
  allowOneTime: true,
  defaultPurchaseType: 'subscription',
  selectedPlanId: 'coffee-monthly',
  plans: [
    {
      id: 'coffee-monthly',
      label: 'Every month',
      period: { value: 1, unit: 'month' },
      discount: { type: 'percent', value: 15 },
      prices: {
        regular: { value: 16.99, currency: 'USD' },
        initial: { value: 12.99, currency: 'USD' },
      },
      trial: { value: 7, unit: 'day' },
      description: 'Light roast subscription with first delivery discount.',
    },
    {
      id: 'coffee-bimonthly',
      label: 'Every 2 months',
      period: { value: 2, unit: 'month' },
      prices: {
        regular: { value: 17.99, currency: 'USD' },
      },
    },
  ],
  customOptions: [
    {
      code: 'grind',
      label: 'Grind',
      required: true,
      type: 'select',
      options: [
        { value: 'whole-bean', label: 'Whole bean' },
        { value: 'espresso', label: 'Espresso grind' },
        { value: 'filter', label: 'Filter grind' },
      ],
    },
  ],
};

/** @type {import('../contract.js').SubscriptionEligibility} */
const configurableCoffeeDark = {
  ...configurableCoffeeLight,
  sku: 'RB-COFFEE-001-D',
  selectedPlanId: 'coffee-dark-monthly',
  plans: [
    {
      id: 'coffee-dark-monthly',
      label: 'Every month',
      period: { value: 1, unit: 'month' },
      discount: { type: 'percent', value: 12 },
      prices: {
        regular: { value: 18.49, currency: 'USD' },
        initial: { value: 14.49, currency: 'USD' },
      },
    },
    {
      id: 'coffee-dark-quarterly',
      label: 'Every 3 months',
      period: { value: 3, unit: 'month' },
      prices: {
        regular: { value: 17.49, currency: 'USD' },
      },
    },
  ],
};

/** @type {import('../contract.js').SubscriptionEligibility} */
const bundleVegetables = {
  sku: 'RB-VEG-BUNDLE-001',
  productType: 'bundle',
  eligible: true,
  allowOneTime: true,
  defaultPurchaseType: 'one_time',
  selectedPlanId: 'veg-weekly',
  plans: [
    {
      id: 'veg-weekly',
      label: 'Weekly box',
      period: { value: 1, unit: 'week' },
      discount: { type: 'percent', value: 8 },
      prices: {
        regular: { value: 24.99, currency: 'USD' },
      },
      description: 'Seasonal vegetables based on bundle selection.',
    },
    {
      id: 'veg-biweekly',
      label: 'Every 2 weeks',
      period: { value: 2, unit: 'week' },
      prices: {
        regular: { value: 25.99, currency: 'USD' },
      },
    },
  ],
};

/** @type {import('../contract.js').SubscriptionEligibility} */
const groupedSampler = {
  sku: 'RB-GROUPED-001',
  productType: 'grouped',
  eligible: true,
  allowOneTime: true,
  defaultPurchaseType: 'one_time',
  selectedPlanId: 'grouped-monthly',
  plans: [
    {
      id: 'grouped-monthly',
      label: 'Monthly sampler',
      period: { value: 1, unit: 'month' },
      prices: {
        regular: { value: 29.99, currency: 'USD' },
      },
      description: 'Subscribe to the grouped sampler set.',
    },
  ],
};

/** @type {import('../contract.js').SubscriptionEligibility} */
const groupedSamplerUnavailable = {
  sku: 'RB-GROUPED-002',
  productType: 'grouped',
  eligible: false,
  allowOneTime: true,
  defaultPurchaseType: 'one_time',
  plans: [],
  ineligibilityReason: 'Grouped product is not subscription-eligible in the mock catalog.',
};

/**
 * Demo-catalog aliases (LwndYQs… / boilerplate-accs).
 * Temporary mapping so subscription UI shows on real PDP products.
 * Remove or replace once Recurbuy catalog SKUs are available.
 */
const demoGiftPackaging = {
  ...simpleBread,
  sku: 'ADB102',
};

const demoYouthTee = {
  ...configurableCoffeeLight,
  sku: 'ADB150',
  parentSku: 'ADB150',
  productType: 'configurable',
};

/**
 * @type {Record<string, import('../contract.js').SubscriptionEligibility>}
 */
export const PRODUCT_FIXTURES = {
  'RB-BREAD-001': simpleBread,
  'RB-COFFEE-001': {
    ...configurableCoffeeLight,
    sku: 'RB-COFFEE-001',
    eligible: false,
    plans: [],
    ineligibilityReason: 'Select a coffee variant to view subscription plans.',
  },
  'RB-COFFEE-001-L': configurableCoffeeLight,
  'RB-COFFEE-001-D': configurableCoffeeDark,
  'RB-VEG-BUNDLE-001': bundleVegetables,
  'RB-GROUPED-001': groupedSampler,
  'RB-GROUPED-002': groupedSamplerUnavailable,

  // Real demo SKUs — open these PDPs to preview subscription UI
  ADB102: demoGiftPackaging,
  ADB150: demoYouthTee,
};

export const FIXTURE_PRODUCTS = [
  { name: 'Simple Bread', sku: 'RB-BREAD-001', productType: 'simple' },
  { name: 'Configurable Coffee', sku: 'RB-COFFEE-001', productType: 'configurable' },
  { name: 'Configurable Coffee (Light)', sku: 'RB-COFFEE-001-L', productType: 'configurable' },
  { name: 'Configurable Coffee (Dark)', sku: 'RB-COFFEE-001-D', productType: 'configurable' },
  { name: 'Bundle Vegetables', sku: 'RB-VEG-BUNDLE-001', productType: 'bundle' },
  { name: 'Grouped Sampler', sku: 'RB-GROUPED-001', productType: 'grouped' },
  { name: 'Gift Packaging (demo alias)', sku: 'ADB102', productType: 'simple' },
  { name: 'Youth Tee (demo alias)', sku: 'ADB150', productType: 'configurable' },
];
