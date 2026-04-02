import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import createSlider from '../../scripts/slider.js';


function setCarouselItems(number) {
    document.querySelector('.carousel > ul')?.style.setProperty('--items-per-view', number);
}

export default function decorate(block) {
  let i = 0;
  setCarouselItems(2);
  const slider = document.createElement('ul');
  const leftContent = document.createElement('div');
  
  // Find the first row index that should be a carousel item
  // This is typically the first row with 4 children (image, content, style config, cta config)
  let carouselStartIndex = 0;
  [...block.children].forEach((row, index) => {
    if (row.children.length === 4 && carouselStartIndex === 0 && index > 0) {
      carouselStartIndex = index;
    }
  });
  
  // If no carousel items found, default to starting after row 3
  if (carouselStartIndex === 0) {
    carouselStartIndex = 4;
  }
  
  [...block.children].forEach((row) => {
    if (i >= carouselStartIndex) {
      const li = document.createElement('li');
      
      // Read card style from the third div (index 2)
      const styleDiv = row.children[2];
      const styleParagraph = styleDiv?.querySelector('p');
      const cardStyle = styleParagraph?.textContent?.trim() || 'default';
      if (cardStyle && cardStyle !== 'default') {
        li.className = cardStyle;
      }
      
      // Read CTA style from the fourth div (index 3)
      const ctaDiv = row.children[3];
      const ctaParagraph = ctaDiv?.querySelector('p');
      const ctaStyle = ctaParagraph?.textContent?.trim() || 'default';

      moveInstrumentation(row, li);
      while (row.firstElementChild) li.append(row.firstElementChild);
      
      // Process the li children to identify and style them correctly
      [...li.children].forEach((div, index) => {
        // First div (index 0) - Image
        if (index === 0) {
          div.className = 'cards-card-image';
        }
        // Second div (index 1) - Content with button
        else if (index === 1) {
          div.className = 'cards-card-body';
        }
        // Third div (index 2) - Card style configuration
        else if (index === 2) {
          div.className = 'cards-config';
          const p = div.querySelector('p');
          if (p) {
            p.style.display = 'none'; // Hide the configuration text
          }
        }
        // Fourth div (index 3) - CTA style configuration
        else if (index === 3) {
          div.className = 'cards-config';
          const p = div.querySelector('p');
          if (p) {
            p.style.display = 'none'; // Hide the configuration text
          }
        }
        // Any other divs
        else {
          div.className = 'cards-card-body';
        }
      });
      
      // Apply CTA styles to button containers
      const buttonContainers = li.querySelectorAll('p.button-container');
      buttonContainers.forEach(buttonContainer => {
        // Remove any existing CTA classes
        buttonContainer.classList.remove('default', 'cta-button', 'cta-button-secondary', 'cta-button-dark', 'cta-default');
        // Add the correct CTA class
        buttonContainer.classList.add(ctaStyle);
      });
      
      slider.append(li);
    } else {
      // Skip rows that contain images - they should not be in leftContent
      // This prevents images from appearing outside/above the carousel
      const hasImage = row.querySelector('img') || row.querySelector('picture');
      if (!hasImage) {
        if (row.firstElementChild?.firstElementChild) {
          leftContent.append(row.firstElementChild.firstElementChild);
        }
        if (row.firstElementChild) {
          leftContent.append(row.firstElementChild.firstElementChild || '');
        }
        leftContent.className = 'default-content-wrapper';
      }
    }
    i += 1;
  });

  slider.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });

  // Accessibility: preserve visual style but expose proper heading level to AT
  // Use aria-level so we don't change font sizes. Default to level 3, or infer from data-heading-level on the block.
  const base = parseInt(block?.dataset?.headingLevel, 10);
  const ariaLevel = Number.isFinite(base) ? Math.min(Math.max(base, 1) + 1, 6) : 3;
  slider.querySelectorAll('h4,h5,h6').forEach((node) => {
    node.setAttribute('role', 'heading');
    node.setAttribute('aria-level', String(ariaLevel));
  });

  block.textContent = '';
  block.parentNode.parentNode.prepend(leftContent);
  block.append(slider);
  createSlider(block);
  initSpotlight(block);
}

function initSpotlight(block) {
  const ul = block.querySelector('ul');
  if (!ul) return;

  const realItems = [...ul.children];
  if (realItems.length === 0) return;
  const count = realItems.length;

  // Clone the full set at each end: [copies | real | copies]
  // This gives a full lap of navigation before the silent reset fires.
  [...realItems].reverse().forEach((item) => {
    const clone = item.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    ul.prepend(clone);
  });
  realItems.forEach((item) => {
    const clone = item.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    ul.append(clone);
  });

  const items = [...ul.children]; // length = 3 * count
  let currentIndex = count; // start at first real card (middle set)
  let isProgrammaticScroll = false;

  function centerOf(idx) {
    const item = items[idx];
    return item.offsetLeft - (ul.clientWidth - item.offsetWidth) / 2;
  }

  function applyActive(idx) {
    items.forEach((item, i) => item.classList.toggle('spotlight-active', i === idx));
  }

  // Instant jump without any visible flash:
  // suppress transitions, set scrollLeft directly, restore next frame
  function silentJump(idx) {
    ul.classList.add('no-transition');
    currentIndex = idx;
    applyActive(currentIndex);
    ul.scrollLeft = centerOf(currentIndex);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ul.classList.remove('no-transition');
      isProgrammaticScroll = false;
    }));
  }

  function scrollToIndex(idx) {
    const target = centerOf(idx);
    isProgrammaticScroll = true;
    ul.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });

    // Use scrollend when available, fall back to timeout
    let handled = false;
    const onEnd = () => {
      if (handled) return;
      handled = true;
      // If we landed on a clone set, silently reset to the real set
      if (currentIndex < count) {
        silentJump(currentIndex + count);
      } else if (currentIndex >= 2 * count) {
        silentJump(currentIndex - count);
      } else {
        isProgrammaticScroll = false;
      }
    };
    ul.addEventListener('scrollend', onEnd, { once: true });
    setTimeout(onEnd, 700); // fallback for browsers without scrollend
  }

  function setActive(idx) {
    currentIndex = idx;
    applyActive(currentIndex);
    scrollToIndex(currentIndex);
  }

  // Replace buttons — remove slider.js handlers, never disable
  ['next', 'prev'].forEach((cls) => {
    const btn = block.querySelector(`button.${cls}`);
    if (!btn) return;
    const fresh = btn.cloneNode(true);
    fresh.disabled = false;
    btn.replaceWith(fresh);
    fresh.addEventListener('click', () => setActive(cls === 'next' ? currentIndex + 1 : currentIndex - 1));
  });

  // Update spotlight on touch/swipe only
  ul.addEventListener('scroll', () => {
    if (isProgrammaticScroll) return;
    const viewCenter = ul.scrollLeft + ul.clientWidth / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    items.forEach((item, idx) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const dist = Math.abs(viewCenter - itemCenter);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    });
    if (bestIdx !== currentIndex) {
      currentIndex = bestIdx;
      applyActive(currentIndex);
    }
  }, { passive: true });

  // Init: position at first real card instantly
  ul.classList.add('no-transition');
  ul.scrollLeft = centerOf(currentIndex);
  applyActive(currentIndex);
  requestAnimationFrame(() => requestAnimationFrame(() => ul.classList.remove('no-transition')));
}