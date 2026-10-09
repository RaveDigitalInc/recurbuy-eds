import { events } from '@dropins/tools/event-bus.js';
import { render as provider } from '@dropins/storefront-cart/render.js';
import * as Cart from '@dropins/storefront-cart/api.js';
import { h } from '@dropins/tools/preact.js';
import {
  InLineAlert,
  Icon,
  Button,
  provider as UI,
} from '@dropins/tools/components.js';

// Dropin Containers
import CartSummaryTable from '@dropins/storefront-cart/containers/CartSummaryTable.js';
import OrderSummary from '@dropins/storefront-cart/containers/OrderSummary.js';
import EstimateShipping from '@dropins/storefront-cart/containers/EstimateShipping.js';
import Coupons from '@dropins/storefront-cart/containers/Coupons.js';
import { render as wishlistRender } from '@dropins/storefront-wishlist/render.js';
import { WishlistAlert } from '@dropins/storefront-wishlist/containers/WishlistAlert.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';

// API
import { publishShoppingCartViewEvent } from '@dropins/storefront-cart/api.js';

// Modal and Mini PDP
import createModal from '../modal/modal.js';
import createMiniPDP from '../commerce-mini-pdp/commerce-mini-pdp.js';

// Initializers
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/wishlist.js';
import { appendCartProductAttributesSlot } from '../../scripts/helpers/cart-product-attributes-slot.js';
import {
  applySubscriptionLinePrices,
  clearCartSubscriptionDetails,
  fetchCartItemSubscriptionDetails,
  renderCartSubscriptionDetails,
  syncCartSubscriptionDetails,
  createSubscriptionSummaryUpdater,
  fetchCheckoutConfig,
} from '../../scripts/subscriptions/index.js';

import { readBlockConfig } from '../../scripts/aem.js';
import { rootLink, fetchPlaceholders } from '../../scripts/commerce.js';

export default async function decorate(block) {
  // Configuration
  const {
    'hide-heading': hideHeading = 'false',
    'enable-item-quantity-update': enableUpdateItemQuantity = 'false',
    'enable-item-remove': enableRemoveItem = 'true',
    'enable-estimate-shipping': enableEstimateShipping = 'false',
    'start-shopping-url': startShoppingURL = '',
    'checkout-url': checkoutURL = '',
    'enable-updating-product': enableUpdatingProduct = 'false',
    'undo-remove-item': undo = 'false',
  } = readBlockConfig(block);

  const placeholders = await fetchPlaceholders();

  // Modal state
  let currentModal = null;
  let currentNotification = null;

  /** Cart item uid -> subscription details from the session snapshot */
  const subscriptionDetailsByUid = new Map();
  const subscriptionPriceSlotsByUid = new Map();
  const subscriptionTotalSlotsByUid = new Map();
  const subscriptionRootsByUid = new Map();
  /** Mixed-cart flags and totals copy from RecurBuy `checkout/config` */
  let checkoutConfig = null;
  let checkoutConfigCartId = null;
  let orderSummary = null;

  // Layout
  const fragment = document.createRange().createContextualFragment(`
    <div class="cart__notification"></div>
    <div class="cart__wrapper">
      <div class="cart__left-column">
        <h1 class="cart__heading">Shopping Cart</h1>
        <div class="cart__list"></div>
        <div class="cart__update"></div>
        <div class="cart__discount"></div>
      </div>
      <div class="cart__right-column">
        <h2 class="cart__summary-title">Summary</h2>
        <details class="cart__estimate">
          <summary class="cart__estimate-toggle">Estimate Shipping and Tax</summary>
          <div class="cart__estimate-body"></div>
        </details>
        <div class="cart__order-summary"></div>
      </div>
    </div>

    <div class="cart__empty-cart"></div>
  `);

  const $wrapper = fragment.querySelector('.cart__wrapper');
  const $notification = fragment.querySelector('.cart__notification');
  const $heading = fragment.querySelector('.cart__heading');
  const $list = fragment.querySelector('.cart__list');
  const $update = fragment.querySelector('.cart__update');
  const $discount = fragment.querySelector('.cart__discount');
  const $summary = fragment.querySelector('.cart__order-summary');
  const $estimate = fragment.querySelector('.cart__estimate');
  const $estimateBody = fragment.querySelector('.cart__estimate-body');
  const $emptyCart = fragment.querySelector('.cart__empty-cart');
  const $rightColumn = fragment.querySelector('.cart__right-column');

  block.innerHTML = '';
  block.appendChild(fragment);

  // Wishlist variables
  const routeToWishlist = '/wishlist';

  // Toggle Empty Cart
  function toggleEmptyCart(_state) {
    $wrapper.removeAttribute('hidden');
    $emptyCart.setAttribute('hidden', '');
  }

  // Handle Edit Button Click
  async function handleEditButtonClick(cartItem) {
    try {
      const miniPDPContent = await createMiniPDP(
        cartItem,
        async (_updateData) => {
          const productName = cartItem.name
            || cartItem.product?.name
            || placeholders?.Global?.CartUpdatedProductName;
          const message = placeholders?.Global?.CartUpdatedProductMessage?.replace(
            '{product}',
            productName,
          );

          currentNotification?.remove();

          currentNotification = await UI.render(InLineAlert, {
            heading: message,
            type: 'success',
            variant: 'primary',
            icon: h(Icon, { source: 'CheckWithCircle' }),
            'aria-live': 'assertive',
            role: 'alert',
            onDismiss: () => {
              currentNotification?.remove();
            },
          })($notification);

          setTimeout(() => {
            currentNotification?.remove();
          }, 5000);
        },
        () => {
          if (currentModal) {
            currentModal.removeModal();
            currentModal = null;
          }
        },
      );

      currentModal = await createModal([miniPDPContent]);

      if (currentModal.block) {
        currentModal.block.setAttribute('id', 'mini-pdp-modal');
      }

      currentModal.showModal();
    } catch (error) {
      console.error('Error opening mini PDP modal:', error);
      currentNotification?.remove();

      currentNotification = await UI.render(InLineAlert, {
        heading: placeholders?.Global?.ProductLoadError,
        type: 'error',
        variant: 'primary',
        icon: h(Icon, { source: 'AlertWithCircle' }),
        'aria-live': 'assertive',
        role: 'alert',
        onDismiss: () => {
          currentNotification?.remove();
        },
      })($notification);
    }
  }

  const summaryLabels = {
    payNow: placeholders?.Global?.YouPayNow,
    chargedFor: placeholders?.Global?.YouWillBeChargedFor,
  };

  // Shipping and the tax row stay inside the collapsed estimate block.
  // The order total reuses the key `taxContent` at sortOrder 900, so only the
  // earlier tax row is removed.

  const buildSummaryUpdater = () => {
    const withSubscription = createSubscriptionSummaryUpdater({
      getItems: () => Cart.getCartDataFromCache()?.items || [],
      getDetailsByUid: () => subscriptionDetailsByUid,
      getConfig: () => checkoutConfig,
      labels: summaryLabels,
      showChargedFor: false,
    });
    return (lineItems) => withSubscription(lineItems).filter((line) => (
      line.key !== 'shippingContent'
      && !(line.key === 'taxContent' && line.sortOrder < 900)
    ));
  };

  const applySubscriptionPrices = (uid, details, item) => {
    applySubscriptionLinePrices(
      subscriptionPriceSlotsByUid,
      subscriptionTotalSlotsByUid,
      uid,
      details,
      item,
    );
  };

  // Render Containers
  const getProductLink = (product) => rootLink(`/products/${product.url.urlKey}/${product.topLevelSku}`);

  if (hideHeading === 'true') $heading.hidden = true;

  [, orderSummary] = await Promise.all([
    provider.render(CartSummaryTable, {
      routeProduct: getProductLink,
      routeEmptyCartCTA: startShoppingURL ? () => rootLink(startShoppingURL) : undefined,
      allowQuantityUpdates: enableUpdateItemQuantity === 'true',
      allowRemoveItems: enableRemoveItem === 'true',
      undo: undo === 'true',
      slots: {
        Thumbnail: (ctx) => {
          const { item, defaultImageProps } = ctx;
          const anchorWrapper = document.createElement('a');
          anchorWrapper.href = getProductLink(item);

          tryRenderAemAssetsImage(ctx, {
            alias: item.sku,
            imageProps: defaultImageProps,
            wrapper: anchorWrapper,
            params: {
              width: defaultImageProps.width,
              height: defaultImageProps.height,
            },
          });
        },

        Price: (ctx) => {
          const { item } = ctx;
          const uid = item?.uid;
          if (!uid) return;

          subscriptionPriceSlotsByUid.set(uid, { ctx, item });
          applySubscriptionPrices(uid, subscriptionDetailsByUid.get(uid), item);
        },

        Subtotal: (ctx) => {
          const { item } = ctx;
          const uid = item?.uid;
          if (!uid) return;

          subscriptionTotalSlotsByUid.set(uid, { ctx, item });
          applySubscriptionPrices(uid, subscriptionDetailsByUid.get(uid), item);
        },

        Configurations: (ctx) => {
          const { item } = ctx;
          const uid = item?.uid;
          if (ctx.querySelector?.('.cart-subscription-details')) return;

          appendCartProductAttributesSlot(ctx, item, { format: 'cart' });

          const subscriptionRoot = document.createElement('div');
          subscriptionRoot.className = 'cart-subscription-details';
          ctx.appendChild(subscriptionRoot);
          if (uid) subscriptionRootsByUid.set(uid, subscriptionRoot);

          const cachedDetails = uid ? subscriptionDetailsByUid.get(uid) : null;
          if (cachedDetails) {
            renderCartSubscriptionDetails(subscriptionRoot, cachedDetails);
            return;
          }

          const details = fetchCartItemSubscriptionDetails(item);
          if (details && uid) {
            subscriptionDetailsByUid.set(uid, details);
            renderCartSubscriptionDetails(subscriptionRoot, details);
            applySubscriptionPrices(uid, details, item);
          } else {
            clearCartSubscriptionDetails(subscriptionRoot);
          }
        },

        Actions: (ctx) => {
          if (enableUpdatingProduct !== 'true') return;

          const editLink = document.createElement('div');
          editLink.className = 'cart-item-edit-link';
          UI.render(Button, {
            variant: 'tertiary',
            size: 'medium',
            icon: h(Icon, { source: 'Edit' }),
            'aria-label': placeholders?.Global?.CartEditButton || 'Edit item',
            onClick: () => handleEditButtonClick(ctx.item),
          })(editLink);
          ctx.appendChild(editLink);
        },
      },
    })($list),

    provider.render(OrderSummary, {
      updateLineItems: buildSummaryUpdater(),
      routeCheckout: checkoutURL ? () => rootLink(checkoutURL) : undefined,
    })($summary),

    UI.render(Button, {
      children: placeholders?.Global?.UpdateShoppingCart || 'Update Shopping Cart',
      variant: 'secondary',
      onClick: () => updateShoppingCart($list),
    })($update),

    provider.render(Coupons)($discount),

    enableEstimateShipping === 'true'
      ? provider.render(EstimateShipping, {})($estimateBody)
      : Promise.resolve(),
  ]);

  if (enableEstimateShipping !== 'true') $estimate.hidden = true;

  let cartViewEventPublished = false;

  // New callback identity makes the drop-in re-run `updateLineItems`.
  const refreshOrderSummary = () => {
    orderSummary?.setProps((prev) => ({
      ...prev,
      updateLineItems: buildSummaryUpdater(),
    }));
    window.requestAnimationFrame(() => polishSummary($summary, placeholders));
  };

  const refreshCheckoutConfig = async (cartData) => {
    const cartId = cartData?.id;
    if (!cartId || cartId === checkoutConfigCartId) return;
    checkoutConfigCartId = cartId;
    checkoutConfig = await fetchCheckoutConfig(cartId);
    refreshOrderSummary();
  };

  const refreshSubscriptionDetails = async (items) => {
    try {
      const next = await syncCartSubscriptionDetails(items, subscriptionDetailsByUid);
      subscriptionDetailsByUid.clear();
      next.forEach((details, uid) => {
        subscriptionDetailsByUid.set(uid, details);
        const item = (items || []).find((entry) => entry?.uid === uid);
        applySubscriptionPrices(uid, details, item);
        const root = subscriptionRootsByUid.get(uid);
        if (root) renderCartSubscriptionDetails(root, details);
      });
      subscriptionRootsByUid.forEach((root, uid) => {
        if (!next.has(uid)) clearCartSubscriptionDetails(root);
      });
      refreshOrderSummary();
    } catch (error) {
      console.error('Error syncing cart subscription details:', error);
    }
  };

  // Events
  events.on(
    'cart/data',
    (cartData) => {
      toggleEmptyCart(isCartEmpty(cartData));

      const isEmpty = !cartData || cartData.totalQuantity < 1;
      $rightColumn.hidden = isEmpty;
      $update.hidden = isEmpty;
      $discount.hidden = isEmpty;
      $heading.hidden = isEmpty || hideHeading === 'true';
      polishSummary($summary, placeholders);

      if (!cartViewEventPublished) {
        cartViewEventPublished = true;
        publishShoppingCartViewEvent();
      }

      refreshSubscriptionDetails(cartData?.items);
      refreshCheckoutConfig(cartData);
    },
    { eager: true },
  );

  events.on('wishlist/alert', ({ action, item }) => {
    wishlistRender.render(WishlistAlert, {
      action,
      item,
      routeToWishlist,
    })($notification);

    setTimeout(() => {
      $notification.innerHTML = '';
    }, 5000);
  });

  return Promise.resolve();
}

function isCartEmpty(cart) {
  return cart ? cart.totalQuantity < 1 : true;
}

/**
 * Applies quantities typed in the table, the way Luma's Update Shopping Cart does.
 * Lines already saved by the drop-in are left as they are.
 * @param {HTMLElement} list
 */
async function updateShoppingCart(list) {
  const cartItems = Cart.getCartDataFromCache()?.items || [];
  const updates = [...list.querySelectorAll('.cart-cart-summary-table__cell-qty-input')]
    .map((input) => {
      const uid = input.id.replace('cart-table-item-quantity-', '');
      const quantity = Number(input.value);
      const current = cartItems.find((item) => item.uid === uid);
      if (!current || !Number.isFinite(quantity) || quantity < 1) return null;
      if (quantity === current.quantity) return null;
      return { uid, quantity };
    })
    .filter(Boolean);

  if (updates.length) {
    await Cart.updateProductsFromCart(updates);
    return;
  }
  if (typeof Cart.refreshCart === 'function') await Cart.refreshCart();
}

/**
 * Drop-in copy says "Order Summary", "Estimated Total" and "Checkout".
 * Luma uses Summary, Order Total and Proceed to Checkout.
 * @param {HTMLElement} summary
 * @param {Record<string, any>} placeholders
 */
function polishSummary(summary, placeholders) {
  const button = summary.querySelector('[data-testid="checkout-button"]');
  if (button) {
    button.textContent = placeholders?.Global?.ProceedToCheckout || 'Proceed to Checkout';
  }

  const discountLabel = document.querySelector('.cart__discount .dropin-accordion-section__title, .cart__discount button');
  if (discountLabel && /discount code/i.test(discountLabel.textContent)) {
    discountLabel.textContent = placeholders?.Global?.ApplyDiscountCode || 'Apply Discount Code';
  }

  summary.querySelectorAll('.cart-order-summary__label, [class*="cart-order-summary"] span, dt, div')
    .forEach((node) => {
      if (node.childNodes.length === 1 && node.textContent.trim() === 'Estimated Total') {
        node.textContent = placeholders?.Global?.OrderTotal || 'Order Total';
      }
    });
}
