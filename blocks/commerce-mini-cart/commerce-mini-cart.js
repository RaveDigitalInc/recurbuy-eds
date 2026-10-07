import { render as provider } from '@dropins/storefront-cart/render.js';
import MiniCart from '@dropins/storefront-cart/containers/MiniCart.js';
import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import {
  InLineAlert,
  Icon,
  provider as UI,
  Button,
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';

import createModal from '../modal/modal.js';
import createMiniPDP from '../commerce-mini-pdp/commerce-mini-pdp.js';

// Initializers
import '../../scripts/initializers/cart.js';

import { readBlockConfig } from '../../scripts/aem.js';
import { fetchPlaceholders, rootLink } from '../../scripts/commerce.js';

import { appendCartProductAttributesSlot } from '../../scripts/helpers/cart-product-attributes-slot.js';
import {
  paintMiniCartSubscriptionPrices,
  syncCartSubscriptionDetails,
  fetchCartItemSubscriptionDetails,
  renderCartSubscriptionDetails,
  clearCartSubscriptionDetails,
} from '../../scripts/subscriptions/index.js';

export default async function decorate(block) {
  const {
    'start-shopping-url': startShoppingURL = '',
    'cart-url': cartURL = '',
    'checkout-url': checkoutURL = '',
    'enable-updating-product': enableUpdatingProduct = 'false',
    'undo-remove-item': undo = 'false',
  } = readBlockConfig(block);

  // Get translations for custom messages
  const placeholders = await fetchPlaceholders();

  const MESSAGES = {
    ADDED: placeholders?.Global?.MiniCartAddedMessage,
    UPDATED: placeholders?.Global?.MiniCartUpdatedMessage,
  };

  // Modal state
  let currentModal = null;
  let currentCartNotification = null;

  const subscriptionDetailsByUid = new Map();
  const subscriptionRootsByUid = new Map();

  // Create a container for the update message
  const updateMessage = document.createElement('div');
  updateMessage.className = 'commerce-mini-cart__update-message';

  // Create shadow wrapper
  const shadowWrapper = document.createElement('div');
  shadowWrapper.className = 'commerce-mini-cart__message-wrapper';
  shadowWrapper.appendChild(updateMessage);

  const showMessage = (message) => {
    updateMessage.textContent = message;
    updateMessage.classList.add('commerce-mini-cart__update-message--visible');
    shadowWrapper.classList.add('commerce-mini-cart__message-wrapper--visible');
    setTimeout(() => {
      updateMessage.classList.remove(
        'commerce-mini-cart__update-message--visible',
      );
      shadowWrapper.classList.remove(
        'commerce-mini-cart__message-wrapper--visible',
      );
    }, 3000);
  };

  // Handle Edit Button Click
  async function handleEditButtonClick(cartItem) {
    try {
      // Create mini PDP content
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

          // Show message in the main cart page
          const cartNotification = document.querySelector(
            '.cart__notification',
          );
          if (cartNotification) {
            // Clear any existing cart notifications
            currentCartNotification?.remove();

            currentCartNotification = await UI.render(InLineAlert, {
              heading: message,
              type: 'success',
              variant: 'primary',
              icon: h(Icon, { source: 'CheckWithCircle' }),
              'aria-live': 'assertive',
              role: 'alert',
              onDismiss: () => {
                currentCartNotification?.remove();
              },
            })(cartNotification);

            // Auto-dismiss after 5 seconds
            setTimeout(() => {
              currentCartNotification?.remove();
            }, 5000);
          }

          // Also trigger message in the mini-cart
          showMessage(message);
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

      // Show error message using mini-cart's message system
      showMessage(
        placeholders?.Global?.ProductLoadError,
      );
    }
  }

  let latestCartItems = [];

  const paintSubscriptionPrices = () => {
    const paint = () => paintMiniCartSubscriptionPrices(latestCartItems, subscriptionDetailsByUid);
    paint();
    requestAnimationFrame(() => {
      paint();
      requestAnimationFrame(paint);
    });
  };

  const applySubscriptionPrices = () => {
    paintSubscriptionPrices();
  };

  const refreshSubscriptionDetails = async (items) => {
    latestCartItems = items || [];
    try {
      const next = await syncCartSubscriptionDetails(items, subscriptionDetailsByUid);
      subscriptionDetailsByUid.clear();
      next.forEach((details, uid) => {
        subscriptionDetailsByUid.set(uid, details);
        const root = subscriptionRootsByUid.get(uid);
        if (root) renderCartSubscriptionDetails(root, details, { variant: 'mini' });
      });
      subscriptionRootsByUid.forEach((root, uid) => {
        if (!next.has(uid)) clearCartSubscriptionDetails(root);
      });
      paintSubscriptionPrices();
    } catch (error) {
      console.error('Error syncing cart subscription details:', error);
    }
  };

  // Add event listeners for cart updates
  events.on(
    'cart/data',
    (cartData) => {
      refreshSubscriptionDetails(cartData?.items);
    },
    { eager: true },
  );
  events.on('cart/product/added', () => showMessage(MESSAGES.ADDED), {
    eager: true,
  });
  events.on('cart/product/updated', () => showMessage(MESSAGES.UPDATED), {
    eager: true,
  });

  // Prevent mini cart from closing when undo is enabled
  if (undo === 'true') {
    // Add event listener to prevent event bubbling from remove buttons
    block.addEventListener('click', (e) => {
      // Check if click is on a remove button or within an undo-related element
      const isRemoveButton = e.target.closest('[class*="remove"]')
        || e.target.closest('[data-testid*="remove"]')
        || e.target.closest('[class*="undo"]')
        || e.target.closest('[data-testid*="undo"]');

      if (isRemoveButton) {
        // Stop the event from bubbling up to document level
        e.stopPropagation();
      }
    });
  }

  block.innerHTML = '';

  // Render MiniCart
  const getProductLink = (product) => rootLink(`/products/${product.url.urlKey}/${product.topLevelSku}`);
  await provider.render(MiniCart, {
    routeEmptyCartCTA: startShoppingURL ? () => rootLink(startShoppingURL) : undefined,
    routeCart: cartURL ? () => rootLink(cartURL) : undefined,
    routeCheckout: checkoutURL ? () => rootLink(checkoutURL) : undefined,
    routeProduct: getProductLink,
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

        if (item?.itemType === 'ConfigurableCartItem' && enableUpdatingProduct === 'true') {
          const editLinkContainer = document.createElement('div');
          editLinkContainer.className = 'cart-item-edit-container';

          const editLink = document.createElement('div');
          editLink.className = 'cart-item-edit-link';

          UI.render(Button, {
            children: placeholders?.Global?.CartEditButton,
            variant: 'tertiary',
            size: 'medium',
            icon: h(Icon, { source: 'Edit' }),
            onClick: () => handleEditButtonClick(item),
          })(editLink);

          editLinkContainer.appendChild(editLink);
          ctx.appendChild(editLinkContainer);
        }
      },
      ItemPrice: () => {
        applySubscriptionPrices();
      },

      ItemTotal: () => {
        applySubscriptionPrices();
      },

      ProductAttributes: (ctx) => {
        const { item } = ctx;
        const uid = item?.uid;

        appendCartProductAttributesSlot(ctx, item, { format: 'cart' });

        // Dedicated container for subscription metadata to avoid layout collisions
        const subscriptionRoot = document.createElement('div');
        subscriptionRoot.className = 'cart-subscription-details cart-subscription-details--compact';
        ctx.appendChild(subscriptionRoot);
        if (uid) subscriptionRootsByUid.set(uid, subscriptionRoot);

        // Render synchronously from cache if available
        const cachedDetails = uid ? subscriptionDetailsByUid.get(uid) : null;
        if (cachedDetails) {
          renderCartSubscriptionDetails(subscriptionRoot, cachedDetails, { variant: 'mini' });
          return;
        }

        // Fallback async fetch with node connectivity check
        const details = fetchCartItemSubscriptionDetails(item);
        if (details && uid) {
          subscriptionDetailsByUid.set(uid, details);
          renderCartSubscriptionDetails(subscriptionRoot, details, { variant: 'mini' });
          applySubscriptionPrices(uid, details);
        } else {
          clearCartSubscriptionDetails(subscriptionRoot);
        }
      },
    },

  })(block);

  // Find the products container and add the message div at the top
  const productsContainer = block.querySelector('.cart-mini-cart__products');
  if (productsContainer) {
    productsContainer.insertBefore(shadowWrapper, productsContainer.firstChild);
  } else {
    console.info('Products container not found, appending message to block');
    block.appendChild(shadowWrapper);
  }

  return block;
}
