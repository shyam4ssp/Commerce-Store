import { bindScrollCarousel } from '../../scripts/scroll-carousel.js';
import { moveInstrumentation } from '../../scripts/ue-utils.js';

function isHeaderRow(row) {
  return !row.querySelector('a.button, .button-container a') && row.children.length <= 2
    && !row.textContent.includes('"');
}

function buildCard(row) {
  const cols = [...row.children];
  const li = document.createElement('li');
  li.className = 'testimonials-item';
  moveInstrumentation(row, li);

  const avatarCol = cols[0];
  const nameCol = cols[1] || cols[0];
  const quoteCol = cols.find((col) => col.textContent.includes('"')) || cols[2];

  const header = document.createElement('div');
  header.className = 'testimonials-author';

  const avatar = document.createElement('div');
  avatar.className = 'testimonials-avatar';
  avatar.textContent = avatarCol?.textContent.trim().charAt(0) || 'J';
  if (avatarCol) moveInstrumentation(avatarCol, avatar);

  const meta = document.createElement('div');
  meta.className = 'testimonials-meta';
  if (nameCol) {
    moveInstrumentation(nameCol, meta);
    meta.append(...nameCol.childNodes);
  }

  header.append(avatar, meta);

  const quote = document.createElement('blockquote');
  quote.className = 'testimonials-quote';
  if (quoteCol) {
    moveInstrumentation(quoteCol, quote);
    quote.append(...quoteCol.childNodes);
  }

  const rating = document.createElement('div');
  rating.className = 'testimonials-rating';
  rating.setAttribute('aria-hidden', 'true');
  rating.textContent = '★★★★★';

  li.append(header, quote, rating);
  return li;
}

export default function decorate(block) {
  const rows = [...block.children];
  const headerRows = [];
  const cardRows = [];
  let ctaRow = null;

  rows.forEach((row) => {
    if (row.querySelector('.button-container a, a.button')) {
      ctaRow = row;
    } else if (isHeaderRow(row)) {
      headerRows.push(row);
    } else {
      cardRows.push(row);
    }
  });

  const header = document.createElement('div');
  header.className = 'testimonials-header';

  headerRows.forEach((row, index) => {
    const content = document.createElement('div');
    content.className = index === 0 ? 'testimonials-title-wrap' : 'testimonials-description';
    content.append(...row.childNodes);
    header.append(content);
    row.remove();
  });

  const list = document.createElement('ul');
  list.className = 'testimonials-list';

  cardRows.forEach((row) => {
    list.append(buildCard(row));
    row.remove();
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'testimonials-wrapper';
  wrapper.append(list);

  bindScrollCarousel(block, list, { label: 'Testimonials' });

  block.append(header, wrapper);

  if (ctaRow) {
    const cta = document.createElement('div');
    cta.className = 'testimonials-cta';
    const link = ctaRow.querySelector('a');
    if (link) {
      const button = document.createElement('a');
      button.className = 'button primary';
      button.href = link.href;
      button.textContent = link.textContent;
      cta.append(button);
    } else {
      cta.append(...ctaRow.childNodes);
    }
    block.append(cta);
    ctaRow.remove();
  }
}
