import { createOptimizedPicture } from '../../scripts/aem.js';
import { bindScrollCarousel } from '../../scripts/scroll-carousel.js';

function isHeaderRow(row) {
  return !row.querySelector('picture, img');
}

function getStarsFromRow(row) {
  const starsCol = [...row.children].find((col) => col.textContent.match(/\(\d+\)/));
  return starsCol ? starsCol.textContent.trim() : '';
}

function buildCard(row) {
  const cols = [...row.children];
  const li = document.createElement('li');
  li.className = 'product-cards-item';

  const imageCol = cols.find((col) => col.querySelector('picture, img'));
  const remaining = cols.filter((col) => col !== imageCol);

  if (imageCol) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'product-cards-image';
    const img = imageCol.querySelector('img');
    if (img) {
      imageWrapper.append(
        createOptimizedPicture(img.src, img.alt, false, [{ width: '680' }]),
      );
    } else {
      imageWrapper.append(...imageCol.childNodes);
    }
    li.append(imageWrapper);
  }

  const body = document.createElement('div');
  body.className = 'product-cards-body';

  remaining.forEach((col, index) => {
    const content = document.createElement('div');
    const text = col.textContent.trim();

    if (text.match(/^SKU:/i)) {
      content.className = 'product-cards-sku';
      content.innerHTML = col.innerHTML;
    } else if (text.match(/^\(\d+\)$/)) {
      content.className = 'product-cards-rating';
      const stars = document.createElement('span');
      stars.className = 'product-cards-stars';
      stars.setAttribute('aria-hidden', 'true');
      stars.textContent = '★★★★★';
      const count = document.createElement('span');
      count.className = 'product-cards-rating-count';
      count.textContent = text;
      content.append(stars, count);
    } else if (col.querySelector('a')) {
      content.className = 'product-cards-price-link';
      const link = col.querySelector('a');
      const cardLink = document.createElement('a');
      cardLink.href = link.href;
      cardLink.textContent = link.textContent;
      content.append(cardLink);
    } else if (index === 0 || col.querySelector('strong, b, h3, h4')) {
      content.className = 'product-cards-title';
      content.append(...col.childNodes);
    } else {
      content.className = 'product-cards-description';
      content.append(...col.childNodes);
    }

    if (content.textContent.trim() || content.querySelector('a, img')) {
      body.append(content);
    }
  });

  li.append(body);
  return li;
}

export default function decorate(block) {
  const rows = [...block.children];
  const isCarousel = block.classList.contains('carousel');

  const headerRows = [];
  const cardRows = [];

  rows.forEach((row) => {
    if (isHeaderRow(row) && !getStarsFromRow(row)) headerRows.push(row);
    else cardRows.push(row);
  });

  const header = document.createElement('div');
  header.className = 'product-cards-header';

  headerRows.forEach((row, index) => {
    const content = document.createElement('div');
    content.className = index === 0 ? 'product-cards-title-wrap' : 'product-cards-description';
    content.append(...row.childNodes);
    header.append(content);
    row.remove();
  });

  const list = document.createElement('ul');
  list.className = 'product-cards-list';

  cardRows.forEach((row) => {
    list.append(buildCard(row));
    row.remove();
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'product-cards-wrapper';
  wrapper.append(list);

  if (isCarousel) {
    block.classList.add('product-cards-carousel');
    wrapper.classList.add('scroll-carousel');
    bindScrollCarousel(block, list, { label: 'Product cards' });
  }

  block.append(header, wrapper);
}
