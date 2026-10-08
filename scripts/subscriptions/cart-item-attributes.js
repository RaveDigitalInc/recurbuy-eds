import { fetchGraphQl } from '@dropins/storefront-cart/api.js';
import { RECURBUY_SUBSCRIPTION_OPTION_ID } from './contract.js';

const SET_CUSTOM_ATTRIBUTES_MUTATION = `
  mutation SetCustomAttributesOnCartItem($input: CartItemCustomAttributesInput!) {
    setCustomAttributesOnCartItem(input: $input) {
      cart {
        id
        itemsV2 {
          items {
            uid
            custom_attributes {
              attribute_code
              value
            }
          }
        }
      }
    }
  }
`;

const UPDATE_CART_ITEMS_MUTATION = `
  mutation UpdateCartItems($cartId: String!, $cartItems: [CartItemUpdateInput!]!) {
    updateCartItems(input: { cart_id: $cartId, cart_items: $cartItems }) {
      cart {
        id
      }
    }
  }
`;

/**
 * Collect SKU strings AccS/drop-in may expose on a cart line.
 * Configurable adds use parent SKU in the mutation; cart lines expose the
 * child as `sku` and the parent as `topLevelSku` (drop-in) / `product.sku` (GQL).
 *
 * @param {Object|null|undefined} item
 * @returns {string[]}
 */
function cartItemSkuCandidates(item) {
  if (!item || typeof item !== 'object') {
    return [];
  }

  const configured = item.configuredVariant || item.configured_variant || {};
  const product = item.product || {};

  return [
    item.sku,
    item.topLevelSku,
    item.parentSku,
    product.sku,
    product.topLevelSku,
    configured.sku,
  ]
    .filter((value) => typeof value === 'string' && value.trim() !== '')
    .map((value) => value.trim().toLowerCase());
}

/**
 * Finds the GraphQL UID of a cart item matching the given SKU.
 * Works with drop-in `cart.items` and raw GraphQL `cart.itemsV2.items`.
 *
 * AccS configurable: add with parent SKU (`Configurable-1`); cart item `sku` is
 * the variant (`Configurable-black-L`) and parent is `topLevelSku`.
 *
 * @param {Object} cart Drop-in cart object
 * @param {string} sku Product SKU passed to add (parent or simple)
 * @param {string} [parentSku] Optional parent SKU when `sku` is a variant
 * @returns {string|null} Cart item UID or null if not found
 */
export function findItemUid(cart, sku, parentSku) {
  if (!cart || !sku) {
    return null;
  }

  const items = cart.items || cart.itemsV2?.items || [];
  if (!Array.isArray(items)) {
    return null;
  }

  const wanted = sku.trim().toLowerCase();
  const parent = typeof parentSku === 'string' ? parentSku.trim().toLowerCase() : '';

  const exact = items.filter((item) => {
    if (!item?.uid) return false;
    const own = typeof item.sku === 'string' ? item.sku.trim().toLowerCase() : '';
    return own !== '' && own === wanted;
  });
  if (exact.length === 1) {
    return exact[0].uid;
  }

  // Configurable children share the parent SKU. A parent match is safe only
  // when the cart has a single line for that parent.
  const parentMatches = items.filter((item) => {
    if (!item?.uid) return false;
    return cartItemSkuCandidates(item).some((candidate) => (
      candidate === wanted || (parent !== '' && candidate === parent)
    ));
  });

  return parentMatches.length === 1 ? parentMatches[0].uid : null;
}

/**
 * Sets RecurBuy subscription custom attributes on a cart item via GraphQL.
 *
 * @param {string} cartId Masked Commerce cart ID
 * @param {string} itemUid GraphQL item UID (e.g., "MjE1")
 * @param {number|string} optionId RecurBuy subscription option ID
 * @param {string} [startDate] Optional subscription start date (YYYY-MM-DD)
 * @returns {Promise<Object>} GraphQL response data
 */
export async function setSubscriptionAttributes(cartId, itemUid, optionId, startDate) {
  if (!cartId || !itemUid || !optionId) {
    throw new Error('[RecurBuy] Missing required parameters for setSubscriptionAttributes.');
  }

  const customAttributes = [
    {
      attribute_code: RECURBUY_SUBSCRIPTION_OPTION_ID,
      value: String(optionId),
    },
  ];

  if (startDate) {
    customAttributes.push({
      attribute_code: 'recurbuy_subscription_start_date',
      value: String(startDate),
    });
  }

  const response = await fetchGraphQl(SET_CUSTOM_ATTRIBUTES_MUTATION, {
    variables: {
      input: {
        cart_id: cartId,
        cart_item_id: itemUid,
        custom_attributes: customAttributes,
      },
    },
  });

  return readGraphQlData(response, 'setting custom attributes');
}

/**
 * Nudges cart item quantity to trigger save_before observer in Magento.
 * Acts as a price recalculation safety net if pending or first save was one-off.
 *
 * @param {string} cartId Masked Commerce cart ID
 * @param {string} itemUid GraphQL item UID (e.g., "MjE1")
 * @param {number} qty Current item quantity
 * @returns {Promise<Object>} GraphQL response data
 */
export async function nudgeQuantity(cartId, itemUid, qty) {
  if (!cartId || !itemUid || !qty) {
    throw new Error('[RecurBuy] Missing required parameters for nudgeQuantity.');
  }

  const response = await fetchGraphQl(UPDATE_CART_ITEMS_MUTATION, {
    variables: {
      cartId,
      cartItems: [
        {
          cart_item_uid: itemUid,
          quantity: Number(qty),
        },
      ],
    },
  });

  return readGraphQlData(response, 'nudging cart item quantity');
}

/**
 * @param {{ errors?: Array<{ message?: string }> }|null|undefined} response
 * @param {string} action
 * @returns {Object|undefined}
 */
function readGraphQlData(response, action) {
  if (response?.errors?.length) {
    const message = response.errors.map((err) => err.message).join(', ');
    throw new Error(`[RecurBuy] GraphQL error ${action}: ${message}`);
  }

  return response?.data;
}
