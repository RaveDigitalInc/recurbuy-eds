import { RECURBUY_SUBSCRIPTION_OPTION_ID } from './contract.js';

/** Stored on the quote line; subscription UI derives details elsewhere. */
export const RECURBUY_SUBSCRIPTION_START_DATE = 'recurbuy_subscription_start_date';

const HIDDEN_CART_LINE_ATTRIBUTE_CODES = new Set([
  RECURBUY_SUBSCRIPTION_OPTION_ID,
  RECURBUY_SUBSCRIPTION_START_DATE,
]);

/**
 * @typedef {{ code: string, value: string }} CartLineAttribute
 */

/**
 * @param {Array<{ attribute_code?: string, value?: string|null }>|null|undefined} attributes
 * @returns {CartLineAttribute[]}
 */
export function mapGraphqlCartLineCustomAttributes(attributes) {
  if (!Array.isArray(attributes)) return [];

  return attributes
    .map((entry) => {
      const code = entry?.attribute_code?.trim();
      const value = entry?.value != null ? String(entry.value).trim() : '';
      if (!code || !value) return null;
      return { code, value };
    })
    .filter(Boolean);
}

/**
 * @param {Array<{ attribute_code?: string, value?: string|null }>|null|undefined} attributes
 * @returns {Record<string, string>}
 */
export function cartLineAttributesToCustomFields(attributes) {
  const fields = {};
  mapGraphqlCartLineCustomAttributes(attributes).forEach(({ code, value }) => {
    fields[code] = value;
  });
  return fields;
}

/**
 * Matches the cart drop-in's product attribute labels (`color_family` → `Color Family`).
 *
 * @param {string} code
 * @returns {string}
 */
export function formatCartAttributeLabel(code) {
  return String(code)
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * @param {{
 *   cartLineAttributes?: CartLineAttribute[],
 *   customFields?: Record<string, string>,
 * }|null|undefined} item
 * @returns {CartLineAttribute[]}
 */
export function getVisibleCartLineAttributes(item) {
  const fromList = Array.isArray(item?.cartLineAttributes) ? item.cartLineAttributes : [];
  if (fromList.length) {
    return fromList.filter(({ code }) => code && !HIDDEN_CART_LINE_ATTRIBUTE_CODES.has(code));
  }

  const fields = item?.customFields;
  if (!fields || typeof fields !== 'object') return [];

  return Object.entries(fields)
    .filter(([code, value]) => code && value && !HIDDEN_CART_LINE_ATTRIBUTE_CODES.has(code))
    .map(([code, value]) => ({ code, value: String(value) }));
}

/**
 * @param {{ customFields?: Record<string, string> }|null|undefined} item
 * @returns {string|null}
 */
export function getSubscriptionOptionIdFromCartItem(item) {
  const value = item?.customFields?.[RECURBUY_SUBSCRIPTION_OPTION_ID];
  if (value == null || value === '') return null;
  return String(value);
}

/**
 * @param {{ customFields?: Record<string, string> }|null|undefined} item
 * @returns {string|null}
 */
export function getSubscriptionStartDateFromCartItem(item) {
  const value = item?.customFields?.[RECURBUY_SUBSCRIPTION_START_DATE];
  if (value == null || value === '') return null;
  return String(value);
}

/**
 * Maps raw Commerce cart GraphQL into drop-in cart item fields.
 *
 * @param {import('@dropins/storefront-cart/api.js').config} cartConfig
 * @returns {(rawCart: Record<string, unknown>) => Record<string, unknown>}
 */
export function createCartModelCustomAttributesTransformer(cartConfig) {
  return (rawCart) => {
    const rawItems = rawCart?.itemsV2?.items;
    if (!Array.isArray(rawItems) || !rawItems.length) {
      return {};
    }

    const maxMiniItems = cartConfig?.getConfig?.()?.miniCartMaxItemsDisplay ?? 10;

    const patchItems = rawItems.map((rawItem) => {
      const cartLineAttributes = mapGraphqlCartLineCustomAttributes(rawItem?.custom_attributes);
      const customFields = cartLineAttributesToCustomFields(rawItem?.custom_attributes);

      if (!cartLineAttributes.length && !Object.keys(customFields).length) {
        return {};
      }

      return {
        ...(cartLineAttributes.length ? { cartLineAttributes } : {}),
        ...(Object.keys(customFields).length ? { customFields } : {}),
      };
    });

    return {
      items: patchItems,
      miniCartMaxItems: patchItems.slice(0, maxMiniItems),
    };
  };
}
