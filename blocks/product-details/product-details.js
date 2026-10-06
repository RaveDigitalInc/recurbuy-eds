import {
  InLineAlert,
  Icon,
  Button,
  provider as UI,
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';
import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import * as pdpApi from '@dropins/storefront-pdp/api.js';
import { render as pdpRendered } from '@dropins/storefront-pdp/render.js';
import { render as wishlistRender } from '@dropins/storefront-wishlist/render.js';

import { WishlistToggle } from '@dropins/storefront-wishlist/containers/WishlistToggle.js';
import { WishlistAlert } from '@dropins/storefront-wishlist/containers/WishlistAlert.js';

// Containers
import ProductHeader from '@dropins/storefront-pdp/containers/ProductHeader.js';
import ProductPrice from '@dropins/storefront-pdp/containers/ProductPrice.js';
import ProductShortDescription from '@dropins/storefront-pdp/containers/ProductShortDescription.js';
import ProductOptions from '@dropins/storefront-pdp/containers/ProductOptions.js';
import ProductQuantity from '@dropins/storefront-pdp/containers/ProductQuantity.js';
import ProductDescription from '@dropins/storefront-pdp/containers/ProductDescription.js';
import ProductGallery from '@dropins/storefront-pdp/containers/ProductGallery.js';

// Libs
import {
  rootLink,
  setJsonLd,
  fetchPlaceholders,
} from '../../scripts/commerce.js';

// Initializers
import { IMAGES_SIZES } from '../../scripts/initializers/pdp.js';
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/wishlist.js';
import {
  CartPayloadAdapter,
  mountSubscriptionOnPdp,
} from '../../scripts/subscriptions/index.js';
import {
  addToCartWithSubscription,
  updateCartItemWithSubscription,
} from '../../scripts/subscriptions/subscription-add-to-cart.js';

// Function to update the Add to Cart button text
function updateAddToCartButtonText(addToCartInstance, inCart, labels) {
  const buttonText = inCart
    ? labels.Global?.UpdateProductInCart
    : labels.Global?.AddProductToCart;
  if (addToCartInstance) {
    addToCartInstance.setProps((prev) => ({
      ...prev,
      children: buttonText,
    }));
  }
}

function updateAddToCartDisabled(addToCartInstance, productValid, subscriptionController) {
  if (!addToCartInstance) return;
  const selectionValid = subscriptionController
    ? subscriptionController.isSelectionValid()
    : true;
  addToCartInstance.setProps((prev) => ({
    ...prev,
    disabled: !productValid || !selectionValid,
  }));
}

export default async function decorate(block) {
  const product = events.lastPayload('pdp/data') ?? null;
  const labels = await fetchPlaceholders();

  // Read itemUid from URL
  const urlParams = new URLSearchParams(window.location.search);
  const itemUidFromUrl = urlParams.get('itemUid');

  // State to track if we are in update mode
  let isUpdateMode = false;

  // Layout
  const fragment = document.createRange().createContextualFragment(`
    <div class="product-details__alert"></div>
    <div class="product-details__wrapper">
      <div class="product-details__left-column">
        <div class="product-details__gallery"></div>
      </div>
      <div class="product-details__right-column">
        <div class="product-details__header"></div>
        <div class="product-details__price"></div>
        <div class="product-details__subscription-price"></div>
        <div class="product-details__subscription"></div>
        <div class="product-details__gallery"></div>
        <div class="product-details__short-description"></div>
        <div class="product-details__configuration">
          <div class="product-details__options"></div>
          <div class="product-details__quantity"></div>
          <div class="product-details__buttons">
            <div class="product-details__buttons__add-to-cart"></div>
            <div class="product-details__buttons__add-to-wishlist"></div>
          </div>
        </div>
        <div class="product-details__description"></div>
      </div>
    </div>
  `);

  const $alert = fragment.querySelector('.product-details__alert');
  const $gallery = fragment.querySelector('.product-details__gallery');
  const $header = fragment.querySelector('.product-details__header');
  const $price = fragment.querySelector('.product-details__price');
  const $subscriptionPrice = fragment.querySelector('.product-details__subscription-price');
  const $galleryMobile = fragment.querySelector('.product-details__right-column .product-details__gallery');
  const $shortDescription = fragment.querySelector('.product-details__short-description');
  const $subscription = fragment.querySelector('.product-details__subscription');
  const $options = fragment.querySelector('.product-details__options');
  const $quantity = fragment.querySelector('.product-details__quantity');
  const $addToCart = fragment.querySelector('.product-details__buttons__add-to-cart');
  const $wishlistToggleBtn = fragment.querySelector('.product-details__buttons__add-to-wishlist');
  const $description = fragment.querySelector('.product-details__description');

  block.replaceChildren(fragment);

  let latestProductValid = true;
  /** @type {{ setProps: Function }|null} */
  let addToCartRef = null;
  const subscriptionController = mountSubscriptionOnPdp({
    selectorRoot: $subscription,
    priceRoot: $subscriptionPrice,
    productPriceRoot: $price,
    onChange: (_selection, meta) => {
      latestProductValid = meta.productValid;
      if (addToCartRef) {
        addToCartRef.setProps((prev) => ({
          ...prev,
          disabled: !meta.productValid || !meta.selectionValid,
        }));
      }
    },
  });

  const gallerySlots = {
    CarouselThumbnail: (ctx) => {
      tryRenderAemAssetsImage(ctx, {
        ...imageSlotConfig(ctx),
        wrapper: document.createElement('span'),
      });
    },

    CarouselMainImage: (ctx) => {
      tryRenderAemAssetsImage(ctx, {
        ...imageSlotConfig(ctx),
      });
    },
  };

  // Alert
  let inlineAlert = null;
  let noticeTimer = null;
  const routeToWishlist = '/wishlist';

  const showCartNotice = async ({ type, heading, description }) => {
    inlineAlert?.remove();
    if (noticeTimer) window.clearTimeout(noticeTimer);

    inlineAlert = await UI.render(InLineAlert, {
      heading,
      description,
      type,
      variant: 'primary',
      icon: h(Icon, { source: type === 'success' ? 'CheckWithCircle' : 'Warning' }),
      'aria-live': 'assertive',
      role: 'alert',
      onDismiss: () => {
        inlineAlert?.remove();
      },
    })($alert);

    $alert.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    if (type === 'success') {
      noticeTimer = window.setTimeout(() => {
        inlineAlert?.remove();
      }, 5000);
    }
  };

  const [
    _galleryMobile,
    _gallery,
    _header,
    _price,
    _shortDescription,
    _options,
    _quantity,
    _description,
    wishlistToggleBtn,
  ] = await Promise.all([
    // Gallery (Mobile)
    pdpRendered.render(ProductGallery, {
      controls: 'dots',
      arrows: true,
      peak: false,
      gap: 'small',
      loop: false,
      imageParams: {
        ...IMAGES_SIZES,
      },

      slots: gallerySlots,
    })($galleryMobile),

    // Gallery (Desktop)
    pdpRendered.render(ProductGallery, {
      controls: 'thumbnailsColumn',
      arrows: true,
      peak: true,
      gap: 'small',
      loop: false,
      imageParams: {
        ...IMAGES_SIZES,
      },

      slots: gallerySlots,
    })($gallery),

    // Header
    pdpRendered.render(ProductHeader, {})($header),

    // Price
    pdpRendered.render(ProductPrice, {})($price),

    // Short Description
    pdpRendered.render(ProductShortDescription, {})($shortDescription),

    // Configuration - Swatches
    pdpRendered.render(ProductOptions, {
      hideSelectedValue: false,
      slots: {
        SwatchImage: (ctx) => {
          tryRenderAemAssetsImage(ctx, {
            ...imageSlotConfig(ctx),
            wrapper: document.createElement('span'),
          });
        },
      },
    })($options),

    // Configuration  Quantity
    pdpRendered.render(ProductQuantity, {})($quantity),

    // Description
    pdpRendered.render(ProductDescription, {})($description),

    // Wishlist button - WishlistToggle Container
    wishlistRender.render(WishlistToggle, {
      product,
    })($wishlistToggleBtn),
  ]);

  // Configuration – Button - Add to Cart
  const addToCart = await UI.render(Button, {
    children: labels.Global?.AddProductToCart,
    icon: h(Icon, { source: 'Cart' }),
    onClick: async () => {
      const buttonActionText = isUpdateMode
        ? labels.Global?.UpdatingInCart
        : labels.Global?.AddingToCart;
      try {
        addToCart.setProps((prev) => ({
          ...prev,
          children: buttonActionText,
          disabled: true,
        }));

        // Get current selection values from PDP API
        const values = pdpApi.getProductConfigurationValues();
        const valid = pdpApi.isProductConfigurationValid();
        const selectionValid = subscriptionController.isSelectionValid();
        const productData = events.lastPayload('pdp/data') ?? product;

        if (!valid || !selectionValid) {
          await showCartNotice({
            type: 'error',
            heading: labels.Global?.AddToCartError || 'Could not add to cart',
            description: labels.Global?.SelectRequiredOptions
              || 'Select the required options before adding this product to the cart.',
          });
          return;
        }

        const catalogProductId = productData?.externalId || product?.externalId;

        const selection = subscriptionController.getSelection();
        const cartItem = CartPayloadAdapter.enrich(
          values || { sku: productData?.sku, quantity: 1 },
          selection,
          {
            parentSku: productData?.sku,
            selectedPlan: selection?.selectedPlan,
          },
        );

        if (isUpdateMode) {
          await updateCartItemWithSubscription({
            cartItem,
            itemUid: itemUidFromUrl,
            selection,
            catalogProductId,
          });

          const updatedSku = cartItem?.sku;
          const cartRedirectUrl = new URL(
            rootLink('/cart'),
            window.location.origin,
          );
          if (updatedSku) {
            cartRedirectUrl.searchParams.set('itemUid', itemUidFromUrl);
          }
          window.location.href = cartRedirectUrl.toString();
          return;
        }

        const added = await addToCartWithSubscription({
          cartItem,
          selection,
          catalogProductId,
        });

        if (!added) {
          throw new Error(
            labels.Global?.AddToCartErrorDescription
              || 'The product could not be added to the cart.',
          );
        }

        const productName = productData?.name || 'This product';
        const addedMessage = (
          labels.Global?.AddedToCartMessage || '{product} was added to your cart.'
        ).replace('{product}', productName);

        await showCartNotice({
          type: 'success',
          heading: labels.Global?.AddedToCart || 'Added to cart',
          description: addedMessage,
        });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        await showCartNotice({
          type: 'error',
          heading: labels.Global?.AddToCartError || 'Could not add to cart',
          description: rawMessage.replace(/^\[RecurBuy\]\s*/, '')
            || labels.Global?.AddToCartErrorDescription
            || 'The product could not be added to the cart.',
        });
      } finally {
        updateAddToCartButtonText(addToCart, isUpdateMode, labels);
        updateAddToCartDisabled(
          addToCart,
          pdpApi.isProductConfigurationValid(),
          subscriptionController,
        );
      }
    },
  })($addToCart);

  addToCartRef = addToCart;
  updateAddToCartDisabled(addToCart, latestProductValid, subscriptionController);

  // Lifecycle Events
  events.on('pdp/valid', (valid) => {
    latestProductValid = valid;
    updateAddToCartDisabled(addToCart, valid, subscriptionController);
  }, { eager: true });

  events.on('pdp/values', () => {
    if (wishlistToggleBtn) {
      const configValues = pdpApi.getProductConfigurationValues();
      const urlOptionsUIDs = urlParams.get('optionsUIDs');
      const optionUIDs = urlOptionsUIDs === '' ? undefined : (configValues?.optionsUIDs || undefined);

      wishlistToggleBtn.setProps((prev) => ({
        ...prev,
        product: {
          ...product,
          optionUIDs,
        },
      }));
    }
  }, { eager: true });

  events.on('wishlist/alert', ({ action, item }) => {
    wishlistRender.render(WishlistAlert, {
      action,
      item,
      routeToWishlist,
    })($alert);

    setTimeout(() => {
      $alert.innerHTML = '';
    }, 5000);

    setTimeout(() => {
      $alert.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 0);
  });

  events.on(
    'cart/data',
    (cartData) => {
      let itemIsInCart = false;
      if (itemUidFromUrl && cartData?.items) {
        itemIsInCart = cartData.items.some(
          (item) => item.uid === itemUidFromUrl,
        );
      }
      isUpdateMode = itemIsInCart;
      updateAddToCartButtonText(addToCart, itemIsInCart, labels);
    },
    { eager: true },
  );

  // Set JSON-LD and Meta Tags
  events.on('aem/lcp', () => {
    if (product) {
      setJsonLdProduct(product);
      setMetaTags(product);
      document.title = product.name;
    }
  }, { eager: true });

  return Promise.resolve();
}

async function setJsonLdProduct(product) {
  const {
    name,
    inStock,
    description,
    sku,
    urlKey,
    price,
    priceRange,
    images,
    attributes,
  } = product;
  const amount = priceRange?.minimum?.final?.amount || price?.final?.amount;
  const brand = attributes.find((attr) => attr.name === 'brand');

  const { data } = await pdpApi.fetchGraphQl(`
    query GET_PRODUCT_VARIANTS($sku: String!) {
      variants(sku: $sku) {
        variants {
          product {
            sku
            name
            inStock
            images(roles: ["image"]) {
              url
            }
            ...on SimpleProductView {
              price {
                final { amount { currency value } }
              }
            }
          }
        }
      }
    }
  `, {
    method: 'GET',
    variables: { sku },
  });

  const variants = data?.variants?.variants || [];

  const ldJson = {
    '@context': 'http://schema.org',
    '@type': 'Product',
    name,
    description,
    image: images[0]?.url,
    offers: [],
    productID: sku,
    brand: {
      '@type': 'Brand',
      name: brand?.value,
    },
    url: new URL(rootLink(`/products/${urlKey}/${sku}`), window.location),
    sku,
    '@id': new URL(rootLink(`/products/${urlKey}/${sku}`), window.location),
  };

  if (variants.length > 1) {
    ldJson.offers.push(...variants.map((variant) => ({
      '@type': 'Offer',
      name: variant.product.name,
      image: variant.product.images[0]?.url,
      price: variant.product.price.final.amount.value,
      priceCurrency: variant.product.price.final.amount.currency,
      availability: variant.product.inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
      sku: variant.product.sku,
    })));
  } else {
    ldJson.offers.push({
      '@type': 'Offer',
      price: amount?.value,
      priceCurrency: amount?.currency,
      availability: inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
    });
  }

  setJsonLd(ldJson, 'product');
}

function createMetaTag(property, content, type) {
  if (!property || !type) {
    return;
  }
  let meta = document.head.querySelector(`meta[${type}="${property}"]`);
  if (meta) {
    if (!content) {
      meta.remove();
      return;
    }
    meta.setAttribute(type, property);
    meta.setAttribute('content', content);
    return;
  }
  if (!content) {
    return;
  }
  meta = document.createElement('meta');
  meta.setAttribute(type, property);
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
}

function setMetaTags(product) {
  if (!product) {
    return;
  }

  const price = product.prices.final.minimumAmount ?? product.prices.final.amount;

  createMetaTag('title', product.metaTitle || product.name, 'name');
  createMetaTag('description', product.metaDescription, 'name');
  createMetaTag('keywords', product.metaKeyword, 'name');

  createMetaTag('og:type', 'product', 'property');
  createMetaTag('og:description', product.shortDescription, 'property');
  createMetaTag('og:title', product.metaTitle || product.name, 'property');
  createMetaTag('og:url', window.location.href, 'property');
  const mainImage = product?.images?.filter((image) => image.roles.includes('thumbnail'))[0];
  const metaImage = mainImage?.url || product?.images[0]?.url;
  createMetaTag('og:image', metaImage, 'property');
  createMetaTag('og:image:secure_url', metaImage, 'property');
  if (price) {
    createMetaTag('product:price:amount', price.value, 'property');
    createMetaTag('product:price:currency', price.currency, 'property');
  }
}

function imageSlotConfig(ctx) {
  const { data, defaultImageProps } = ctx;
  return {
    alias: data.sku,
    imageProps: defaultImageProps,
    params: {
      width: defaultImageProps.width,
      height: defaultImageProps.height,
    },
  };
}
