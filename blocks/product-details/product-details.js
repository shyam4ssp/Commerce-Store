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
import ProductAttributes from '@dropins/storefront-pdp/containers/ProductAttributes.js';
import ProductGallery from '@dropins/storefront-pdp/containers/ProductGallery.js';
import ProductGiftCardOptions from '@dropins/storefront-pdp/containers/ProductGiftCardOptions.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';

// Libs
import {
  rootLink,
  setJsonLd,
  fetchPlaceholders,
  getProductLink,
  checkIsAuthenticated,
} from '../../scripts/commerce.js';

// Initializers
import { IMAGES_SIZES } from '../../scripts/initializers/pdp.js';
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/wishlist.js';

const SHORT_DESCRIPTION_PREVIEW_LENGTH = 160;

/**
 * Checks if the page has prerendered product JSON-LD data
 * @returns {boolean} True if product JSON-LD exists and contains @type=Product
 */
function isProductPrerendered() {
  const jsonLdScript = document.querySelector('script[type="application/ld+json"]');

  if (!jsonLdScript?.textContent) {
    return false;
  }

  try {
    const jsonLd = JSON.parse(jsonLdScript.textContent);
    return jsonLd?.['@type'] === 'Product';
  } catch (error) {
    console.debug('Failed to parse JSON-LD:', error);
    return false;
  }
}

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

/**
 * Formats numeric attribute values for display (e.g., "10.000000" → "10").
 * Non-numeric values are returned as-is.
 */
function formatNumericAttributeValue(value) {
  const trimmed = value.trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return value;
  return new Intl.NumberFormat(document.documentElement.lang).format(Number(trimmed));
}

/**
 * Reads a product attribute value by name (case-insensitive).
 * @param {Object} product
 * @param {string[]} names
 * @returns {string|number|undefined}
 */
function getAttributeValue(product, names) {
  const attrs = product?.attributes || [];
  const match = attrs.find((attr) => names.some(
    (name) => attr.name?.toLowerCase() === name.toLowerCase(),
  ));
  return match?.value;
}

/**
 * Returns true when the shopper is authenticated (cookie or ACO header).
 * @returns {boolean}
 */
function isShopperAuthenticated() {
  const headerFlag = getConfigValue('headers.cs.isLoggedIn');
  return checkIsAuthenticated()
    || headerFlag === true
    || headerFlag === 'true';
}

/**
 * Builds rating markup when review data is available on the product.
 * @param {Object} product
 * @param {Object} labels
 * @returns {HTMLElement|null}
 */
function buildRating(product, labels) {
  const reviewCount = Number(
    getAttributeValue(product, ['review_count', 'reviews_count', 'rating_count']) ?? NaN,
  );
  if (!Number.isFinite(reviewCount) || reviewCount < 0) return null;

  const reviewsLabel = labels.Global?.Reviews || 'Reviews';
  const rating = document.createElement('div');
  rating.className = 'product-details__rating';

  const stars = document.createElement('span');
  stars.className = 'product-details__stars';
  stars.setAttribute('aria-hidden', 'true');
  stars.textContent = '★★★★★';

  const count = document.createElement('span');
  count.className = 'product-details__rating-count';
  count.textContent = `${reviewCount} ${reviewsLabel}`;

  rating.append(stars, count);
  return rating;
}

/**
 * Builds stock availability badge.
 * @param {boolean} inStock
 * @param {Object} labels
 * @returns {HTMLElement}
 */
function buildStockBadge(inStock, labels) {
  const badge = document.createElement('span');
  badge.className = `product-details__stock-badge product-details__stock-badge--${
    inStock ? 'in-stock' : 'out-of-stock'
  }`;
  badge.textContent = inStock
    ? (labels.Global?.InStock || 'In Stock')
    : (labels.Global?.OutOfStock || 'Out of Stock');
  return badge;
}

/**
 * Enhances short description with a More... toggle matching the Figma PDP.
 * @param {Element} container
 * @param {Object} labels
 */
function enhanceShortDescription(container, labels) {
  const description = container.querySelector('.pdp-short-description');
  if (!description || description.dataset.enhanced === 'true') return;

  const fullText = description.textContent?.trim() || '';
  if (!fullText || fullText.length <= SHORT_DESCRIPTION_PREVIEW_LENGTH) {
    description.dataset.enhanced = 'true';
    return;
  }

  const moreLabel = labels.Global?.More || 'More...';
  const lessLabel = labels.Global?.Less || 'Less';
  const preview = `${fullText.slice(0, SHORT_DESCRIPTION_PREVIEW_LENGTH).trimEnd()}…`;

  description.dataset.enhanced = 'true';
  description.dataset.expanded = 'false';
  description.textContent = preview;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'product-details__more-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = `<span>${moreLabel}</span>`;

  toggle.addEventListener('click', () => {
    const expanded = description.dataset.expanded === 'true';
    description.dataset.expanded = String(!expanded);
    description.textContent = expanded ? preview : fullText;
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.querySelector('span').textContent = expanded ? moreLabel : lessLabel;
    description.append(' ', toggle);
  });

  description.append(' ', toggle);
}

/**
 * Builds the reviews tab panel content from available product review attributes.
 * @param {Object|null} product
 * @param {Object} labels
 * @returns {HTMLElement}
 */
function buildReviewsPanel(product, labels) {
  const panel = document.createElement('div');
  panel.className = 'product-details__reviews';

  const reviewCount = Number(
    getAttributeValue(product, ['review_count', 'reviews_count', 'rating_count']) ?? 0,
  );
  const ratingValue = Number(
    getAttributeValue(product, ['rating_summary', 'rating', 'average_rating']) ?? NaN,
  );

  if (Number.isFinite(reviewCount) && reviewCount > 0) {
    const summary = document.createElement('div');
    summary.className = 'product-details__reviews-summary';

    const stars = document.createElement('span');
    stars.className = 'product-details__stars';
    stars.setAttribute('aria-hidden', 'true');
    stars.textContent = '★★★★★';

    const meta = document.createElement('p');
    meta.className = 'product-details__reviews-meta';
    const reviewsLabel = labels.Global?.Reviews || 'Reviews';
    meta.textContent = Number.isFinite(ratingValue)
      ? `${ratingValue} / 5 · ${reviewCount} ${reviewsLabel}`
      : `${reviewCount} ${reviewsLabel}`;

    summary.append(stars, meta);
    panel.append(summary);
  } else {
    const empty = document.createElement('p');
    empty.className = 'product-details__reviews-empty';
    empty.textContent = labels.Global?.NoReviews || 'No reviews yet for this product.';
    panel.append(empty);
  }

  return panel;
}

/**
 * Wires Product Description / Specifications / Reviews tab interactions.
 * @param {Element} tabsRoot
 */
function initProductTabs(tabsRoot) {
  const buttons = [...tabsRoot.querySelectorAll('[role="tab"]')];
  const panels = [...tabsRoot.querySelectorAll('[role="tabpanel"]')];

  const activate = (tabId) => {
    buttons.forEach((button) => {
      const selected = button.dataset.tab === tabId;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });

    panels.forEach((panel) => {
      const selected = panel.dataset.tabPanel === tabId;
      panel.classList.toggle('is-active', selected);
      panel.hidden = !selected;
    });
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => activate(button.dataset.tab));
    button.addEventListener('keydown', (event) => {
      const index = buttons.indexOf(button);
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const next = buttons[(index + 1) % buttons.length];
        next.focus();
        activate(next.dataset.tab);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prev = buttons[(index - 1 + buttons.length) % buttons.length];
        prev.focus();
        activate(prev.dataset.tab);
      }
    });
  });

  activate(buttons.find((button) => button.classList.contains('is-active'))?.dataset.tab || 'description');
}

/**
 * Builds the requisition list control for authenticated shoppers.
 * @param {Object} labels
 * @returns {HTMLElement}
 */
function buildRequisitionControl(labels) {
  const requisition = document.createElement('div');
  requisition.className = 'product-details__requisition';

  const requisitionBtn = document.createElement('button');
  requisitionBtn.type = 'button';
  requisitionBtn.className = 'product-details__requisition-toggle';
  requisitionBtn.setAttribute('aria-haspopup', 'listbox');
  requisitionBtn.setAttribute('aria-expanded', 'false');

  const requisitionText = document.createElement('span');
  requisitionText.textContent = labels.Global?.AddToRequisitionList || 'Add to Requisition List';
  requisitionBtn.append(requisitionText);

  const requisitionMenu = document.createElement('ul');
  requisitionMenu.className = 'product-details__requisition-menu';
  requisitionMenu.hidden = true;
  requisitionMenu.setAttribute('role', 'listbox');

  const createItem = document.createElement('li');
  createItem.setAttribute('role', 'option');
  const createLink = document.createElement('a');
  createLink.href = rootLink('/customer/account/requisition_list/');
  createLink.textContent = labels.Global?.CreateRequisitionList || 'Create New Requisition List';
  createItem.append(createLink);
  requisitionMenu.append(createItem);

  requisitionBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = requisitionMenu.hidden;
    requisitionMenu.hidden = !open;
    requisitionBtn.setAttribute('aria-expanded', String(open));
  });

  requisition.append(requisitionBtn, requisitionMenu);
  return requisition;
}

export default async function decorate(block) {
  const eventProduct = events.lastPayload('pdp/data') ?? null;
  // bug: the pdp sends an object with event data even if product is not found.
  const product = eventProduct?.sku ? eventProduct : null;

  const labels = await fetchPlaceholders();
  const loginPriceLabel = labels.Global?.LoginToSeePrice || 'Login to see the price';
  const qtyLabel = labels.Global?.Quantity || 'Qty:';
  const wishlistLabel = labels.Global?.AddToWishList || 'Add to Wish List';
  const wishlistedLabel = labels.Global?.InWishList || 'In Wish List';
  const descriptionTabLabel = labels.Global?.ProductDescription || 'Product Description';
  const specificationsTabLabel = labels.Global?.Specifications || 'Specifications';
  const reviewsTabLabel = labels.Global?.Reviews || 'Reviews';

  // Read itemUid from URL
  const urlParams = new URLSearchParams(window.location.search);
  const itemUidFromUrl = urlParams.get('itemUid');

  // State to track if we are in update mode
  let isUpdateMode = false;

  // State to track if the current product/variant is out of stock
  let isOutOfStock = false;

  // Layout — buy box stays in the right column; tabs are full-width below (Figma)
  const fragment = document.createRange().createContextualFragment(`
    <div class="product-details__alert"></div>
    <div class="product-details__wrapper">
      <div class="product-details__left-column">
        <div class="product-details__gallery"></div>
      </div>
      <div class="product-details__right-column">
        <div class="product-details__header"></div>
        <div class="product-details__meta">
          <div class="product-details__rating-slot"></div>
          <div class="product-details__stock"></div>
        </div>
        <div class="product-details__price"></div>
        <div class="product-details__gallery"></div>
        <div class="product-details__short-description"></div>
        <div class="product-details__gift-card-options"></div>
        <div class="product-details__guest-cta">
          <a class="product-details__login-price" href="${rootLink('/customer/login')}">${loginPriceLabel}</a>
        </div>
        <div class="product-details__configuration">
          <div class="product-details__options"></div>
          <div class="product-details__purchase">
            <div class="product-details__quantity-wrap">
              <span class="product-details__quantity-label">${qtyLabel}</span>
              <div class="product-details__quantity"></div>
            </div>
            <div class="product-details__buttons__add-to-cart"></div>
          </div>
          <div class="product-details__secondary-actions">
            <div class="product-details__buttons__add-to-wishlist"></div>
            <div class="product-details__requisition-slot"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="product-details__tabs" data-tabs>
      <div class="product-details__tablist" role="tablist" aria-label="${descriptionTabLabel}">
        <button type="button" class="product-details__tab is-active" role="tab" id="pdp-tab-description" data-tab="description" aria-controls="pdp-panel-description" aria-selected="true">${descriptionTabLabel}</button>
        <button type="button" class="product-details__tab" role="tab" id="pdp-tab-specifications" data-tab="specifications" aria-controls="pdp-panel-specifications" aria-selected="false" tabindex="-1">${specificationsTabLabel}</button>
        <button type="button" class="product-details__tab" role="tab" id="pdp-tab-reviews" data-tab="reviews" aria-controls="pdp-panel-reviews" aria-selected="false" tabindex="-1">${reviewsTabLabel}</button>
      </div>
      <div class="product-details__tabpanels">
        <div class="product-details__tabpanel is-active" role="tabpanel" id="pdp-panel-description" data-tab-panel="description" aria-labelledby="pdp-tab-description">
          <div class="product-details__description"></div>
        </div>
        <div class="product-details__tabpanel" role="tabpanel" id="pdp-panel-specifications" data-tab-panel="specifications" aria-labelledby="pdp-tab-specifications" hidden>
          <div class="product-details__attributes"></div>
        </div>
        <div class="product-details__tabpanel" role="tabpanel" id="pdp-panel-reviews" data-tab-panel="reviews" aria-labelledby="pdp-tab-reviews" hidden>
          <div class="product-details__reviews-slot"></div>
        </div>
      </div>
    </div>
  `);

  const $alert = fragment.querySelector('.product-details__alert');
  const $gallery = fragment.querySelector('.product-details__gallery');
  const $header = fragment.querySelector('.product-details__header');
  const $ratingSlot = fragment.querySelector('.product-details__rating-slot');
  const $stock = fragment.querySelector('.product-details__stock');
  const $price = fragment.querySelector('.product-details__price');
  const $galleryMobile = fragment.querySelector('.product-details__right-column .product-details__gallery');
  const $shortDescription = fragment.querySelector('.product-details__short-description');
  const $options = fragment.querySelector('.product-details__options');
  const $quantity = fragment.querySelector('.product-details__quantity');
  const $giftCardOptions = fragment.querySelector('.product-details__gift-card-options');
  const $addToCart = fragment.querySelector('.product-details__buttons__add-to-cart');
  const $wishlistToggleBtn = fragment.querySelector('.product-details__buttons__add-to-wishlist');
  const $requisitionSlot = fragment.querySelector('.product-details__requisition-slot');
  const $description = fragment.querySelector('.product-details__description');
  const $attributes = fragment.querySelector('.product-details__attributes');
  const $tabs = fragment.querySelector('.product-details__tabs');
  const $reviewsSlot = fragment.querySelector('.product-details__reviews-slot');

  block.replaceChildren(fragment);
  block.classList.toggle('product-details--authenticated', isShopperAuthenticated());

  const rating = product ? buildRating(product, labels) : null;
  if (rating) {
    $ratingSlot.replaceChildren(rating);
  }

  $reviewsSlot.replaceChildren(buildReviewsPanel(product, labels));
  initProductTabs($tabs);
  $requisitionSlot.replaceChildren(buildRequisitionControl(labels));

  document.addEventListener('click', (event) => {
    if (event.target.closest('.product-details__requisition')) return;
    const menu = $requisitionSlot.querySelector('.product-details__requisition-menu');
    const toggle = $requisitionSlot.querySelector('.product-details__requisition-toggle');
    if (menu && toggle) {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  const gallerySlots = {
    CarouselThumbnail: (ctx) => {
      if (ctx.mediaType === 'image') {
        tryRenderAemAssetsImage(ctx, {
          ...imageSlotConfig(ctx),
          wrapper: document.createElement('span'),
        });
      }
    },

    CarouselMainImage: (ctx) => {
      if (ctx.mediaType === 'image') {
        tryRenderAemAssetsImage(ctx, {
          ...imageSlotConfig(ctx),
        });
      }
    },
  };

  // Alert
  let inlineAlert = null;
  const routeToWishlist = rootLink('/wishlist');

  const [
    _galleryMobile,
    _gallery,
    _header,
    _price,
    _shortDescription,
    _options,
    _quantity,
    _giftCardOptions,
    _description,
    _attributes,
    wishlistToggleBtn,
  ] = await Promise.all([
    // Gallery (Mobile)
    pdpRendered.render(ProductGallery, {
      controls: 'dots',
      arrows: true,
      peak: false,
      gap: 'small',
      loop: false,
      videos: true, // Display videos if available
      imageParams: {
        ...IMAGES_SIZES,
      },

      slots: gallerySlots,
    })($galleryMobile),

    // Gallery (Desktop) — horizontal thumbnails match Figma PDP
    pdpRendered.render(ProductGallery, {
      controls: 'thumbnailsRow',
      arrows: true,
      peak: false,
      gap: 'small',
      loop: false,
      videos: true, // Display videos if available
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

    // Configuration  Gift Card Options
    pdpRendered.render(ProductGiftCardOptions, {})($giftCardOptions),

    // Description
    pdpRendered.render(ProductDescription, {})($description),

    // Attributes
    pdpRendered.render(ProductAttributes, {
      formatValue: formatNumericAttributeValue,
    })($attributes),

    // Wishlist button - WishlistToggle Container
    wishlistRender.render(WishlistToggle, {
      product,
      variant: 'secondary',
      size: 'medium',
      labelToWishlist: wishlistLabel,
      labelWishlisted: wishlistedLabel,
    })($wishlistToggleBtn),
  ]);

  // SKU
  if (product?.sku) {
    const sku = document.createElement('div');
    sku.className = 'pdp-header__sku';
    sku.innerHTML = `<strong>SKU:</strong> ${product.sku}`;

    $header.querySelector('.pdp-header__sku').replaceWith(sku);
  }

  enhanceShortDescription($shortDescription, labels);

  // Configuration – Button - Add to Cart
  const addToCart = await UI.render(Button, {
    children: labels.Global?.AddProductToCart,
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

        // get the current selection values
        const values = pdpApi.getProductConfigurationValues();
        const valid = pdpApi.isProductConfigurationValid();

        // add or update the product in the cart
        if (valid) {
          if (isUpdateMode) {
            // --- Update existing item ---
            const { updateProductsFromCart } = await import(
              '@dropins/storefront-cart/api.js'
            );

            await updateProductsFromCart([{ ...values, uid: itemUidFromUrl }]);

            // --- START REDIRECT ON UPDATE ---
            const updatedSku = values?.sku;
            if (updatedSku) {
              const cartRedirectUrl = new URL(
                rootLink('/cart'),
                window.location.origin,
              );
              cartRedirectUrl.searchParams.set('itemUid', itemUidFromUrl);
              window.location.href = cartRedirectUrl.toString();
            } else {
              // Fallback if SKU is somehow missing (shouldn't happen in normal flow)
              console.warn(
                'Could not retrieve SKU for updated item. Redirecting to cart without parameter.',
              );
              window.location.href = rootLink('/cart');
            }
            return;
          }
          // --- Add new item ---
          const { addProductsToCart } = await import(
            '@dropins/storefront-cart/api.js'
          );
          await addProductsToCart([{ ...values }]);
        }

        // reset any previous alerts if successful
        inlineAlert?.remove();
      } catch (error) {
        // add alert message
        inlineAlert = await UI.render(InLineAlert, {
          heading: 'Error',
          description: error.message,
          icon: h(Icon, { source: 'Warning' }),
          'aria-live': 'assertive',
          role: 'alert',
          onDismiss: () => {
            inlineAlert.remove();
          },
        })($alert);

        // Scroll the alertWrapper into view
        $alert.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      } finally {
        // Reset button text using the helper function which respects the current mode
        updateAddToCartButtonText(addToCart, isUpdateMode, labels);
        // Re-enable button, unless the current variant is out of stock
        addToCart.setProps((prev) => ({
          ...prev,
          disabled: isOutOfStock,
        }));
      }
    },
  })($addToCart);

  // Lifecycle Events
  events.on('authenticated', (isAuthenticated) => {
    block.classList.toggle(
      'product-details--authenticated',
      !!isAuthenticated || isShopperAuthenticated(),
    );
  }, { eager: true });

  events.on('pdp/data', (data) => {
    isOutOfStock = data?.inStock === false;
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock }));

    if (data) {
      $stock.replaceChildren(buildStockBadge(data.inStock !== false, labels));

      const nextRating = buildRating(data, labels);
      $ratingSlot.replaceChildren(nextRating || '');
      $reviewsSlot.replaceChildren(buildReviewsPanel(data, labels));

      // Re-apply More... when short description content updates with product data
      window.requestAnimationFrame(() => {
        enhanceShortDescription($shortDescription, labels);
      });
    }
  }, { eager: true });

  events.on('pdp/valid', (valid) => {
    // update add to cart button disabled state based on product selection validity and stock status
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock || !valid }));
  }, { eager: true });

  // Handle option changes
  events.on('pdp/values', () => {
    if (wishlistToggleBtn) {
      const configValues = pdpApi.getProductConfigurationValues();

      // Check URL parameter for empty optionsUIDs
      const urlOptionsUIDs = urlParams.get('optionsUIDs');

      // If URL has empty optionsUIDs parameter, treat as base product (no options)
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

  // --- Add new event listener for cart/data ---
  events.on(
    'cart/data',
    (cartData) => {
      let itemIsInCart = false;
      if (itemUidFromUrl && cartData?.items) {
        itemIsInCart = cartData.items.some(
          (item) => item.uid === itemUidFromUrl,
        );
      }
      // Set the update mode state
      isUpdateMode = itemIsInCart;

      // Update button text based on whether the item is in the cart
      updateAddToCartButtonText(addToCart, itemIsInCart, labels);
    },
    { eager: true },
  );

  // Set JSON-LD and Meta Tags
  events.on('aem/lcp', () => {
    const isPrerendered = isProductPrerendered();
    if (product && !isPrerendered) {
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
  const brand = attributes?.find((attr) => attr.name === 'brand');

  // get variants
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
    url: new URL(getProductLink(urlKey, sku), window.location),
    sku,
    '@id': new URL(getProductLink(urlKey, sku), window.location),
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
  if (!product?.sku) {
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
  createMetaTag('product:price:amount', price.value, 'property');
  createMetaTag('product:price:currency', price.currency, 'property');
}

/**
 * Returns the configuration for an image slot.
 * @param ctx - The context of the slot.
 * @returns The configuration for the image slot.
 */
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
