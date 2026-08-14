/**
 * Mock subscription API contract shared by UI, gateway, and cart adapters.
 * Replace the DummyJSON adapter with a SaaS implementation without changing these shapes.
 */

/** @typedef {'day'|'week'|'month'|'year'} PeriodUnit */

/**
 * @typedef {Object} SubscriptionPeriod
 * @property {number} value
 * @property {PeriodUnit} unit
 */

/**
 * @typedef {Object} MoneyAmount
 * @property {number} value
 * @property {string} currency
 */

/**
 * @typedef {Object} SubscriptionDiscount
 * @property {'percent'|'fixed'} type
 * @property {number} value
 */

/**
 * @typedef {Object} SubscriptionPlanPrices
 * @property {MoneyAmount} regular
 * @property {MoneyAmount} [initial]
 */

/**
 * @typedef {Object} SubscriptionPlan
 * @property {string} id
 * @property {string} label
 * @property {SubscriptionPeriod} period
 * @property {SubscriptionDiscount} [discount]
 * @property {SubscriptionPlanPrices} prices
 * @property {SubscriptionPeriod} [trial]
 * @property {string} [description]
 */

/**
 * @typedef {'simple'|'configurable'|'bundle'|'grouped'|'virtual'|'downloadable'} ProductType
 */

/**
 * @typedef {'one_time'|'subscription'} PurchaseType
 */

/**
 * @typedef {Object} SubscriptionCustomOption
 * @property {string} code
 * @property {string} label
 * @property {boolean} required
 * @property {'select'|'text'|'date'} type
 * @property {Array<{value: string, label: string}>} [options]
 */

/**
 * @typedef {Object} BundleSelection
 * @property {string} sku
 * @property {number} quantity
 */

/**
 * @typedef {Object} SubscriptionEligibilityRequest
 * @property {string} sku
 * @property {string} [parentSku]
 * @property {ProductType} productType
 * @property {number} [quantity]
 * @property {string[]} [optionsUIDs]
 * @property {Record<string, string>} [enteredOptions]
 * @property {BundleSelection[]} [bundleSelections]
 * @property {BundleSelection[]} [groupedSelections]
 */

/**
 * @typedef {Object} SubscriptionEligibility
 * @property {string} sku
 * @property {string} [parentSku]
 * @property {ProductType} productType
 * @property {boolean} eligible
 * @property {boolean} allowOneTime
 * @property {PurchaseType} defaultPurchaseType
 * @property {string} [selectedPlanId]
 * @property {SubscriptionPlan[]} plans
 * @property {SubscriptionCustomOption[]} [customOptions]
 * @property {string} [ineligibilityReason]
 */

/**
 * @typedef {Object} SubscriptionSelection
 * @property {PurchaseType} purchaseType
 * @property {string} [planId]
 * @property {Record<string, string>} [customOptionValues]
 */

/**
 * @typedef {Object} CartSubscriptionDetails
 * @property {string} planId
 * @property {string} planLabel
 * @property {SubscriptionPeriod} period
 * @property {MoneyAmount} price
 * @property {string} [startDate]
 * @property {PurchaseType} purchaseType
 */

/**
 * @typedef {Object} SubscriptionError
 * @property {string} code
 * @property {string} message
 */

/**
 * @typedef {Object} SubscriptionCatalogResponse
 * @property {Record<string, SubscriptionEligibility>} catalog
 */

/**
 * @typedef {Object} SubscriptionEligibilityResponse
 * @property {SubscriptionEligibility} [data]
 * @property {SubscriptionError} [error]
 */

/**
 * @typedef {Object} CartSubscriptionDetailsRequest
 * @property {string} sku
 * @property {string} [parentSku]
 * @property {string} [cartItemUid]
 * @property {string} [planId]
 */

/**
 * @typedef {Object} CartSubscriptionDetailsResponse
 * @property {CartSubscriptionDetails} [data]
 * @property {SubscriptionError} [error]
 */

export const SUBSCRIPTION_ERROR_CODES = {
  NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  NOT_ELIGIBLE: 'SUBSCRIPTION_NOT_ELIGIBLE',
  NETWORK: 'SUBSCRIPTION_NETWORK_ERROR',
  INVALID_REQUEST: 'SUBSCRIPTION_INVALID_REQUEST',
  SERVER: 'SUBSCRIPTION_SERVER_ERROR',
};

export const SUBSCRIPTION_CUSTOM_FIELD_KEY = 'subscription';
