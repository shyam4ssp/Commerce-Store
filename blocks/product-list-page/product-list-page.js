// Product Discovery Dropins
import SearchResults from '@dropins/storefront-product-discovery/containers/SearchResults.js';
import Facets from '@dropins/storefront-product-discovery/containers/Facets.js';
import SortBy from '@dropins/storefront-product-discovery/containers/SortBy.js';
import Pagination from '@dropins/storefront-product-discovery/containers/Pagination.js';
import { render as provider } from '@dropins/storefront-product-discovery/render.js';
import {
  Button, Icon, provider as UI,
} from '@dropins/tools/components.js';
import { search } from '@dropins/storefront-product-discovery/api.js';
import { tryGenerateAemAssetsOptimizedUrl } from '@dropins/tools/lib/aem/assets.js';
// Cart Dropin
import * as cartApi from '@dropins/storefront-cart/api.js';
// Event Bus
import { events } from '@dropins/tools/event-bus.js';
// AEM
import { readBlockConfig } from '../../scripts/aem.js';
import {
  checkIsAuthenticated,
  fetchPlaceholders,
  getProductLink,
  rootLink,
} from '../../scripts/commerce.js';
import { getSearchStateFromUrl, applySearchStateToUrl } from './search-url.js';

// Initializers
import '../../scripts/initializers/search.js';
import '../../scripts/initializers/cart.js';

const DESCRIPTION_MAX_LENGTH = 140;

/**
 * Strips HTML tags from a string.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return '';
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || '';
}

/**
 * Truncates text with an ellipsis.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function truncateText(text, max = DESCRIPTION_MAX_LENGTH) {
  if (!text || text.length <= max) return text || '';
  return `${text.slice(0, max).trimEnd()}...`;
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
 * Builds rating markup when review data is available on the product.
 * @param {Object} product
 * @returns {HTMLElement|null}
 */
function buildRating(product) {
  const reviewCount = Number(
    getAttributeValue(product, ['review_count', 'reviews_count', 'rating_count']) ?? NaN,
  );
  if (!Number.isFinite(reviewCount) || reviewCount < 0) return null;

  const rating = document.createElement('div');
  rating.className = 'plp-product-rating';

  const stars = document.createElement('span');
  stars.className = 'plp-product-stars';
  stars.setAttribute('aria-hidden', 'true');
  stars.textContent = '★★★★★';

  const count = document.createElement('span');
  count.className = 'plp-product-rating-count';
  count.textContent = `(${reviewCount})`;

  rating.append(stars, count);
  return rating;
}

/**
 * Formats a currency amount.
 * @param {number} value
 * @param {string} currency
 * @returns {string}
 */
function formatMoney(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `$${value}`;
  }
}

/**
 * Builds price display data for a product (final + optional regular for sale).
 * @param {Object} product
 * @returns {{ finalText: string, regularText?: string }}
 */
function getProductPriceDisplay(product) {
  const currency = product?.price?.final?.amount?.currency
    || product?.priceRange?.minimum?.final?.amount?.currency
    || 'USD';

  if (product?.typename === 'ComplexProductView' && product.priceRange) {
    const minFinal = product.priceRange.minimum?.final?.amount?.value;
    const maxFinal = product.priceRange.maximum?.final?.amount?.value;
    const minRegular = product.priceRange.minimum?.regular?.amount?.value;
    const maxRegular = product.priceRange.maximum?.regular?.amount?.value;
    if (minFinal == null) return { finalText: '' };

    const finalText = (maxFinal != null && maxFinal !== minFinal)
      ? `From ${formatMoney(minFinal, currency)} To ${formatMoney(maxFinal, currency)}`
      : formatMoney(minFinal, currency);

    const hasSale = minRegular != null && minRegular > minFinal;
    if (!hasSale) return { finalText };

    const regularText = (maxRegular != null && maxRegular !== minRegular)
      ? `From ${formatMoney(minRegular, currency)} To ${formatMoney(maxRegular, currency)}`
      : formatMoney(minRegular, currency);
    return { finalText, regularText };
  }

  const final = product?.price?.final?.amount?.value;
  const regular = product?.price?.regular?.amount?.value;
  if (final == null) return { finalText: '' };

  const finalText = formatMoney(final, currency);
  if (regular != null && regular > final) {
    return { finalText, regularText: formatMoney(regular, currency) };
  }
  return { finalText };
}

/**
 * Renders price markup (final + optional strikethrough regular).
 * @param {Object} product
 * @returns {HTMLElement}
 */
function buildPriceValue(product) {
  const { finalText, regularText } = getProductPriceDisplay(product);
  const priceValue = document.createElement('div');
  priceValue.className = 'plp-price-value';

  if (!finalText) return priceValue;

  const finalEl = document.createElement('span');
  finalEl.className = 'plp-price-final';
  finalEl.textContent = finalText;
  priceValue.append(finalEl);

  if (regularText) {
    const regularEl = document.createElement('span');
    regularEl.className = 'plp-price-regular';
    regularEl.textContent = regularText;
    priceValue.append(regularEl);
  }

  return priceValue;
}

/**
 * Formats a URL path segment for display (e.g. "area-of-machine" → "Area Of Machine").
 * @param {string} segment
 * @returns {string}
 */
function formatPathSegment(segment) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Builds breadcrumb crumb data for the current list page.
 * @param {Object} config
 * @param {Element|null} h1
 * @param {Object} labels
 * @returns {{ label: string, href?: string }[]}
 */
function getBreadcrumbCrumbs(config, h1, labels) {
  const homeLabel = labels.Global?.Home || 'Home';
  const crumbs = [{ label: homeLabel, href: rootLink('/') }];

  if (config.urlpath) {
    const parts = String(config.urlpath).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    let path = '';
    parts.forEach((part, index) => {
      path += `/${part}`;
      const isLast = index === parts.length - 1;
      const label = isLast && h1?.textContent?.trim()
        ? h1.textContent.trim()
        : formatPathSegment(part);
      crumbs.push(isLast ? { label } : { label, href: rootLink(path) });
    });
  } else {
    crumbs.push({ label: labels.Global?.Search || 'Search' });
  }

  return crumbs;
}

/**
 * Renders breadcrumbs under the header and above the page h1 (or above the PLP block).
 * @param {Element} block
 * @param {Object} config
 * @param {Object} labels
 */
function renderBreadcrumbs(block, config, labels) {
  const section = block.closest('.section');
  const h1 = section?.querySelector('h1');
  const crumbs = getBreadcrumbCrumbs(config, h1, labels);
  if (crumbs.length < 2) return;

  const nav = document.createElement('nav');
  nav.className = 'breadcrumbs product-list-page-breadcrumbs';
  nav.setAttribute('aria-label', 'Breadcrumb');

  const list = document.createElement('ol');
  list.className = 'breadcrumbs__list';

  crumbs.forEach((crumb, index) => {
    const item = document.createElement('li');
    item.className = 'breadcrumbs__item';
    const isLast = index === crumbs.length - 1;

    if (crumb.href && !isLast) {
      const link = document.createElement('a');
      link.className = 'breadcrumbs__link';
      link.href = crumb.href;
      link.textContent = crumb.label;
      item.append(link);
    } else {
      const current = document.createElement('span');
      current.className = 'breadcrumbs__current';
      current.setAttribute('aria-current', 'page');
      current.textContent = crumb.label;
      item.append(current);
    }

    list.append(item);
  });

  nav.append(list);

  if (h1) {
    h1.before(nav);
  } else if (block.parentElement) {
    block.parentElement.before(nav);
  } else {
    block.before(nav);
  }
}

export default async function decorate(block) {
  const labels = await fetchPlaceholders();

  const config = readBlockConfig(block);
  const pageSize = parseInt(config.pagesize, 10) || 9;

  renderBreadcrumbs(block, config, labels);

  const loginPriceLabel = labels.Global?.LoginToSeePrice || 'Login to see the price';
  const inStockLabel = labels.Global?.InStock || 'In Stock';
  const backorderLabel = labels.Global?.Backorder || 'Backorder';
  const skuLabel = labels.Global?.Sku || 'SKU';
  const addToCartLabel = labels.Global?.AddProductToCart || 'Add to Cart';
  const requisitionLabel = labels.Global?.AddToRequisitionList || 'Add to Requisition List';

  /**
   * Builds authenticated product actions (Add to Cart + Requisition List).
   * @param {Object} product
   * @returns {HTMLElement}
   */
  const buildAuthenticatedActions = (product) => {
    const actions = document.createElement('div');
    actions.className = 'plp-product-actions';

    const addToCartWrap = document.createElement('div');
    addToCartWrap.className = 'plp-add-to-cart';

    if (product.typename === 'ComplexProductView') {
      UI.render(Button, {
        children: addToCartLabel,
        href: getProductLink(product.urlKey, product.sku),
        variant: 'primary',
      })(addToCartWrap);
    } else {
      UI.render(Button, {
        children: addToCartLabel,
        onClick: () => cartApi.addProductsToCart([{ sku: product.sku, quantity: 1 }]),
        variant: 'primary',
        disabled: !product.inStock,
      })(addToCartWrap);
    }

    const requisition = document.createElement('div');
    requisition.className = 'plp-requisition';

    const requisitionBtn = document.createElement('button');
    requisitionBtn.type = 'button';
    requisitionBtn.className = 'plp-requisition-toggle';
    requisitionBtn.setAttribute('aria-haspopup', 'listbox');
    requisitionBtn.setAttribute('aria-expanded', 'false');
    const requisitionText = document.createElement('span');
    requisitionText.textContent = requisitionLabel;
    requisitionBtn.append(requisitionText);

    const requisitionMenu = document.createElement('ul');
    requisitionMenu.className = 'plp-requisition-menu';
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
      document.querySelectorAll('.plp-requisition-menu').forEach((menu) => {
        menu.hidden = true;
        menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
      });
      requisitionMenu.hidden = !open;
      requisitionBtn.setAttribute('aria-expanded', String(open));
    });

    requisition.append(requisitionBtn, requisitionMenu);
    actions.append(addToCartWrap, requisition);
    return actions;
  };

  const fragment = document.createRange().createContextualFragment(`
    <div class="search__wrapper">
      <div class="search__result-info"></div>
      <div class="search__view-facets"></div>
      <div class="search__facets"></div>
      <div class="search__toolbar">
        <div class="search__view-toggle" role="group" aria-label="Product view">
          <button type="button" class="search__view-btn search__view-btn--grid is-active" data-view="grid" aria-pressed="true" aria-label="Grid view">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="2.25" fill="currentColor"/><circle cx="15" cy="5" r="2.25" fill="currentColor"/><circle cx="5" cy="15" r="2.25" fill="currentColor"/><circle cx="15" cy="15" r="2.25" fill="currentColor"/></svg>
          </button>
          <button type="button" class="search__view-btn search__view-btn--list" data-view="list" aria-pressed="false" aria-label="List view">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="2" y="3.5" width="16" height="2" rx="0.5" fill="currentColor"/><rect x="2" y="9" width="16" height="2" rx="0.5" fill="currentColor"/><rect x="2" y="14.5" width="16" height="2" rx="0.5" fill="currentColor"/></svg>
          </button>
        </div>
        <div class="search__sort-controls">
          <span class="search__sort-label">Sort by:</span>
          <div class="search__product-sort"></div>
          <span class="search__sort-icon" aria-hidden="true"></span>
        </div>
      </div>
      <div class="search__product-list"></div>
      <div class="search__pagination"></div>
    </div>
  `);

  const $resultInfo = fragment.querySelector('.search__result-info');
  const $viewFacets = fragment.querySelector('.search__view-facets');
  const $facets = fragment.querySelector('.search__facets');
  const $viewToggle = fragment.querySelector('.search__view-toggle');
  const $productSort = fragment.querySelector('.search__product-sort');
  const $productList = fragment.querySelector('.search__product-list');
  const $pagination = fragment.querySelector('.search__pagination');

  block.innerHTML = '';
  block.appendChild(fragment);
  block.classList.toggle('product-list-page--authenticated', checkIsAuthenticated());
  block.dataset.view = 'grid';

  // Add url path back to the block for enrichment, incase enrichment block is
  // executed after the plp block and block config is not available
  if (config.urlpath) {
    block.dataset.urlpath = config.urlpath;
  }

  const searchState = getSearchStateFromUrl(new URL(window.location.href));

  // Default visibility filter for all of our requests
  const visibilityFilter = { attribute: 'visibility', in: ['Search', 'Catalog, Search'] };
  const userFilters = searchState.filter.filter((f) => f.attribute !== 'visibility');

  // Normalize URL (e.g. pipe-separated filter values)
  const normalizedUrl = new URL(window.location.href);
  applySearchStateToUrl(normalizedUrl, searchState);
  window.history.replaceState({}, '', normalizedUrl.toString());

  // Request search based on the page type on block load
  if (config.urlpath) {
    // If it's a category page...
    await search({
      phrase: '', // search all products in the category
      currentPage: searchState.currentPage,
      pageSize,
      sort: searchState?.sort?.length ? searchState.sort : [{ attribute: 'position', direction: 'DESC' }],
      filter: [
        { attribute: 'categoryPath', eq: config.urlpath }, // Add category filter
        // Always add visibility filter to the request
        visibilityFilter,
        ...userFilters,
      ],
    }).catch(() => {
      console.error('Error searching for products');
    });
  } else {
    // Search page: dropin uses only the request (no URL parsing).
    await search({
      phrase: searchState.phrase,
      currentPage: searchState.currentPage,
      pageSize,
      sort: searchState.sort,
      // Always add visibility filter to the request
      filter: [visibilityFilter, ...userFilters],
    }).catch((e) => {
      console.error('Error searching for products', e);
    });
  }

  $viewToggle.addEventListener('click', (event) => {
    const button = event.target.closest('.search__view-btn');
    if (!button || !$viewToggle.contains(button)) return;

    const { view } = button.dataset;
    if (!view || block.dataset.view === view) return;

    block.dataset.view = view;
    $viewToggle.querySelectorAll('.search__view-btn').forEach((btn) => {
      const active = btn === button;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  });

  events.on('authenticated', (isAuthenticated) => {
    block.classList.toggle('product-list-page--authenticated', !!isAuthenticated);
  }, { eager: true });

  await Promise.all([
    // Sort By
    provider.render(SortBy, {})($productSort),

    // Pagination
    provider.render(Pagination, {
      onPageChange: () => {
        // scroll to the top of the page
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    })($pagination),

    // View Facets Button
    UI.render(Button, {
      children: labels.Global?.Filters,
      icon: Icon({ source: 'Burger' }),
      variant: 'secondary',
      onClick: () => {
        $facets.classList.toggle('search__facets--visible');
      },
    })($viewFacets),

    // Facets
    provider.render(Facets, {
      slots: {
        FacetBucketLabel: (ctx) => {
          // Match design: plain labels without result counts
          if (ctx.data.__typename === 'RangeBucket') return;
          const label = document.createElement('span');
          label.textContent = ctx.data.title;
          ctx.replaceWith(label);
        },
      },
    })($facets),
    // Product List
    provider.render(SearchResults, {
      routeProduct: (product) => getProductLink(product.urlKey, product.sku),
      imageWidth: 300,
      imageHeight: 240,
      slots: {
        ProductImage: (ctx) => {
          const { product, defaultImageProps } = ctx;
          const imageWrap = document.createElement('div');
          imageWrap.className = 'plp-product-image';

          const badge = document.createElement('span');
          badge.className = product.inStock
            ? 'plp-stock-badge plp-stock-badge--in-stock'
            : 'plp-stock-badge plp-stock-badge--backorder';
          badge.textContent = product.inStock ? inStockLabel : backorderLabel;

          const anchorWrapper = document.createElement('a');
          anchorWrapper.className = 'plp-product-image-link';
          anchorWrapper.href = getProductLink(product.urlKey, product.sku);

          const img = document.createElement('img');
          const width = defaultImageProps?.width || 300;
          const height = defaultImageProps?.height || 240;
          const src = defaultImageProps?.src
            ? tryGenerateAemAssetsOptimizedUrl(
              defaultImageProps.src,
              product.sku,
              { width, height },
            )
            : '';
          img.src = src || defaultImageProps?.src || '';
          img.alt = defaultImageProps?.alt || product.name || '';
          img.width = width;
          img.height = height;
          img.loading = 'lazy';

          anchorWrapper.append(img);
          imageWrap.append(badge, anchorWrapper);
          ctx.replaceWith(imageWrap);
        },
        ProductName: (ctx) => {
          const { product } = ctx;
          const details = document.createElement('div');
          details.className = 'plp-product-details';

          const title = document.createElement('a');
          title.className = 'plp-product-title';
          title.href = getProductLink(product.urlKey, product.sku);
          title.textContent = stripHtml(product.name) || product.sku;

          const sku = document.createElement('div');
          sku.className = 'plp-product-sku';
          const skuStrong = document.createElement('strong');
          skuStrong.textContent = `${skuLabel}:`;
          sku.append(skuStrong, document.createTextNode(` ${product.sku || ''}`));

          details.append(title, sku);

          const rating = buildRating(product);
          if (rating) details.append(rating);

          const descriptionText = truncateText(
            stripHtml(product.shortDescription || product.description || ''),
          );
          if (descriptionText) {
            const description = document.createElement('p');
            description.className = 'plp-product-description';
            description.textContent = descriptionText;
            details.append(description);
          }

          ctx.replaceWith(details);
        },
        ProductPrice: (ctx) => {
          const { product } = ctx;
          const priceWrap = document.createElement('div');
          priceWrap.className = 'plp-product-price';

          const loginLink = document.createElement('a');
          loginLink.className = 'plp-login-price';
          loginLink.href = rootLink('/customer/login');
          loginLink.textContent = loginPriceLabel;

          priceWrap.append(loginLink, buildPriceValue(product));
          ctx.replaceWith(priceWrap);
        },
        ProductActions: (ctx) => {
          ctx.replaceWith(buildAuthenticatedActions(ctx.product));
        },
      },
    })($productList),
  ]);

  // Close requisition menus on outside click
  document.addEventListener('click', (event) => {
    if (event.target.closest('.plp-requisition')) return;
    $productList.querySelectorAll('.plp-requisition-menu').forEach((menu) => {
      menu.hidden = true;
      menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
    });
  });

  // Accordion behavior for facet sidebar (matches filter design)
  const collapsedFacets = new Set();
  let defaultCollapseApplied = false;

  const getFacetTitle = (header) => header.childNodes[0]?.textContent?.trim()
    || header.textContent.trim();

  const expandFacetLists = () => {
    $facets.querySelectorAll('.product-discovery-facet > button').forEach((btn) => {
      if (/show more/i.test(btn.textContent || '')) {
        btn.click();
      }
    });
  };

  const syncFacetAccordions = () => {
    const facets = [...$facets.querySelectorAll('.product-discovery-facet')];

    // First load: keep the first facet open, collapse the rest (like the design)
    if (!defaultCollapseApplied && facets.length > 1) {
      facets.slice(1).forEach((facet) => {
        const header = facet.querySelector('.product-discovery-facet__header');
        if (header) collapsedFacets.add(getFacetTitle(header));
      });
      defaultCollapseApplied = true;
    }

    facets.forEach((facet) => {
      const header = facet.querySelector('.product-discovery-facet__header');
      if (!header) return;

      const title = getFacetTitle(header);
      const collapsed = collapsedFacets.has(title);
      facet.classList.toggle('product-discovery-facet--collapsed', collapsed);
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-expanded', String(!collapsed));
    });
  };

  $facets.addEventListener('click', (event) => {
    const header = event.target.closest('.product-discovery-facet__header');
    if (!header || !$facets.contains(header)) return;

    const facet = header.closest('.product-discovery-facet');
    if (!facet) return;

    const title = getFacetTitle(header);
    const collapsed = facet.classList.toggle('product-discovery-facet--collapsed');
    header.setAttribute('aria-expanded', String(!collapsed));
    if (collapsed) collapsedFacets.add(title);
    else collapsedFacets.delete(title);
  });

  $facets.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const header = event.target.closest('.product-discovery-facet__header');
    if (!header || !$facets.contains(header)) return;
    event.preventDefault();
    header.click();
  });

  const facetsObserver = new MutationObserver(() => {
    expandFacetLists();
    syncFacetAccordions();
  });
  facetsObserver.observe($facets, { childList: true, subtree: true });

  // Listen for search results (event is fired before the block is rendered; eager: true)
  events.on('search/result', (payload) => {
    const totalCount = payload.result?.totalCount || 0;

    block.classList.toggle('product-list-page--empty', totalCount === 0);

    // Results Info
    $resultInfo.innerHTML = payload.request?.phrase
      ? `${totalCount} results found for <strong>"${payload.request.phrase}"</strong>.`
      : `${totalCount} results found.`;

    // Update the view facets button with the number of filters
    if (payload.request.filter.length > 0) {
      $viewFacets.querySelector('button').setAttribute('data-count', payload.request.filter.length);
    } else {
      $viewFacets.querySelector('button').removeAttribute('data-count');
    }

    // Facet DOM updates after Preact re-render
    requestAnimationFrame(() => {
      expandFacetLists();
      syncFacetAccordions();
    });
  }, { eager: true });

  // Listen for search results (event is fired after the block is rendered; eager: false)
  // URL is owned by this project; update it when search state changes.
  events.on('search/result', (payload) => {
    const url = new URL(window.location.href);
    applySearchStateToUrl(url, payload.request);
    window.history.pushState({}, '', url.toString());
  }, { eager: false });
}
