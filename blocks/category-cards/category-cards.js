import { createOptimizedPicture } from '../../scripts/aem.js';
import { bindScrollCarousel } from '../../scripts/scroll-carousel.js';
import { moveInstrumentation } from '../../scripts/ue-utils.js';

function isCardRow(row) {
  const component = row.getAttribute('data-aue-component') || row.getAttribute('data-aue-model');
  if (component === 'category-card') return true;
  if (row.children.length >= 2) return true;
  return Boolean(row.querySelector('picture, img, a'));
}

function buildCard(row) {
  const cols = [...row.children];
  const li = document.createElement('li');
  li.className = 'category-cards-item';
  moveInstrumentation(row, li);

  const imageCol = cols.find((col) => col.querySelector('picture, img')) || cols[0];
  const textCol = cols.find((col) => col !== imageCol) || cols[1] || cols[0];

  if (imageCol) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'category-cards-image';
    moveInstrumentation(imageCol, imageWrapper);
    const img = imageCol.querySelector('img');
    if (img) {
      const picture = createOptimizedPicture(img.src, img.alt, false, [{ width: '880' }]);
      const newImg = picture.querySelector('img');
      if (newImg) moveInstrumentation(img, newImg);
      imageWrapper.append(picture);
    } else {
      imageWrapper.append(...imageCol.childNodes);
    }
    li.append(imageWrapper);
  }

  const body = document.createElement('div');
  body.className = 'category-cards-body';
  if (textCol) {
    moveInstrumentation(textCol, body);
    const link = textCol.querySelector('a');
    if (link) {
      const cardLink = document.createElement('a');
      cardLink.className = 'category-cards-link';
      cardLink.href = link.href;
      cardLink.textContent = link.textContent;
      cardLink.setAttribute('aria-label', link.textContent);
      moveInstrumentation(link, cardLink);
      body.append(cardLink);
    } else {
      body.append(...textCol.childNodes);
    }
  }
  li.append(body);

  return li;
}

export default function decorate(block) {
  const rows = [...block.children];
  const isCarousel = block.classList.contains('carousel');
  const isMachine = block.classList.contains('machine');

  const headerRows = [];
  const cardRows = [];

  rows.forEach((row) => {
    if (isCardRow(row)) cardRows.push(row);
    else headerRows.push(row);
  });

  const header = document.createElement('div');
  header.className = 'category-cards-header';

  headerRows.forEach((row, index) => {
    const content = document.createElement('div');
    content.className = index === 0 ? 'category-cards-title' : 'category-cards-description';
    content.append(...row.childNodes);
    header.append(content);
    row.remove();
  });

  const list = document.createElement('ul');
  list.className = 'category-cards-list';

  cardRows.forEach((row) => {
    list.append(buildCard(row));
    row.remove();
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'category-cards-wrapper';
  wrapper.append(list);

  if (isCarousel) {
    block.classList.add('category-cards-carousel');
    wrapper.classList.add('scroll-carousel');
    bindScrollCarousel(block, list, { label: 'Category cards' });
  }

  if (isMachine) {
    block.classList.add('category-cards-machine');
  }

  block.append(header, wrapper);
}
