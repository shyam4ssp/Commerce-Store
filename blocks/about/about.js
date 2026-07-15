import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const rows = [...block.children];

  const section = document.createElement('div');
  section.className = 'about-inner';

  const background = document.createElement('div');
  background.className = 'about-background';

  const panel = document.createElement('div');
  panel.className = 'about-panel';

  const content = document.createElement('div');
  content.className = 'about-content';

  rows.forEach((row) => {
    const label = row.children[0]?.textContent.trim().toLowerCase();
    const valueCell = row.children[1] || row.children[0];

    switch (label) {
      case 'backgroundimage': {
        const imageUrl = valueCell.textContent.trim();
      
        if (imageUrl) {
          const img = document.createElement('img');
          img.src = imageUrl;
          img.alt = '';
          img.loading = 'lazy';
      
          background.append(img);
        }
      
        break;
      }

      case 'eyebrow': {
        const div = document.createElement('div');
        div.className = 'about-eyebrow';
        div.append(...valueCell.childNodes);
        content.append(div);
        break;
      }

      case 'content': {
        const div = document.createElement('div');
        div.className = 'about-copy';
        div.append(...valueCell.childNodes);
        content.append(div);
        break;
      }

      default:
        break;
    }
  });

  if (background.hasChildNodes()) {
    section.append(background);
  }

  panel.append(content);
  section.append(panel);

  block.textContent = '';
  block.append(section);
}