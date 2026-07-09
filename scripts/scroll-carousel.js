/**
 * Adds prev/next controls to a horizontal scroll container.
 * @param {Element} block The block element
 * @param {Element} scrollEl The scrollable element
 * @param {Object} [options]
 * @param {string} [options.label] Accessible label for navigation
 */
export function bindScrollCarousel(block, scrollEl, options = {}) {
  const { label = 'Carousel navigation' } = options;
  const nav = document.createElement('div');
  nav.className = 'scroll-carousel-nav';
  nav.setAttribute('aria-label', label);
  nav.innerHTML = `
    <button type="button" class="scroll-carousel-prev" aria-label="Previous">
      <span class="icon icon-chevron-left" aria-hidden="true"><svg width="7" height="12" viewBox="0 0 7 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.75 0.75L0.75 5.75L5.75 10.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </button>
    <button type="button" class="scroll-carousel-next" aria-label="Next">
      <span class="icon icon-chevron-right" aria-hidden="true"><svg width="7" height="12" viewBox="0 0 7 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0.75 0.75L5.75 5.75L0.75 10.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </button>
  `;

  const prev = nav.querySelector('.scroll-carousel-prev');
  const next = nav.querySelector('.scroll-carousel-next');

  const getScrollAmount = () => {
    const firstItem = scrollEl.querySelector(':scope > *');
    if (!firstItem) return scrollEl.clientWidth;
    const style = getComputedStyle(scrollEl);
    const gap = parseFloat(style.columnGap || style.gap || '0') || 0;
    return firstItem.offsetWidth + gap;
  };

  const updateButtons = () => {
    const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
    prev.disabled = scrollEl.scrollLeft <= 1;
    next.disabled = scrollEl.scrollLeft >= maxScroll - 1;
  };

  prev.addEventListener('click', () => {
    scrollEl.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
  });

  next.addEventListener('click', () => {
    scrollEl.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
  });

  scrollEl.addEventListener('scroll', updateButtons, { passive: true });
  window.addEventListener('resize', updateButtons);

  block.prepend(nav);
  requestAnimationFrame(updateButtons);
}
