import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const rows = [...block.children];
  const bgRow = rows.find((row) => row.querySelector('picture, img'));
  const contentRows = rows.filter((row) => row !== bgRow);

  const section = document.createElement('div');
  section.className = 'about-inner';

  if (bgRow) {
    const bg = document.createElement('div');
    bg.className = 'about-background';
    const img = bgRow.querySelector('img');
    if (img) {
      bg.append(
        createOptimizedPicture(img.src, img.alt, true, [{ width: '1920' }]),
      );
    }
    section.append(bg);
    bgRow.remove();
  }

  const panel = document.createElement('div');
  panel.className = 'about-panel';

  const content = document.createElement('div');
  content.className = 'about-content';

  contentRows.forEach((row, index) => {
    const wrapper = document.createElement('div');
    if (index === 0) {
      wrapper.className = 'about-eyebrow';
    } else if (index === 1) {
      wrapper.className = 'about-heading';
    } else if (row.querySelector('a')) {
      wrapper.className = 'about-cta';
      const link = row.querySelector('a');
      const cta = document.createElement('a');
      cta.className = 'about-link';
      cta.href = link.href;
      cta.textContent = link.textContent;
      wrapper.append(cta);
    } else {
      wrapper.className = 'about-copy';
    }

    if (!wrapper.classList.contains('about-cta')) {
      wrapper.append(...row.childNodes);
    }
    content.append(wrapper);
    row.remove();
  });

  panel.append(content);
  section.append(panel);
  block.append(section);
}
