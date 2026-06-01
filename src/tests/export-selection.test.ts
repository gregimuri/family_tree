import { describe, it, expect } from 'vitest';
import {
  stripPersonCardSelectionChrome,
  stripSvgSelectionChrome,
} from '../services/export/image-export';

describe('export selection chrome', () => {
  it('restores normal card border instead of yellow selection ring', () => {
    const card = document.createElement('div');
    card.className = 'person-card-html selected';
    card.dataset.exportBorder = '#2563eb';
    card.dataset.exportBoxShadow = '0 2px 10px rgba(28, 25, 23, 0.08)';
    card.style.borderColor = '#eab308';
    card.style.boxShadow = '0 0 0 2px #eab308, 0 2px 10px rgba(28, 25, 23, 0.08)';

    stripPersonCardSelectionChrome(card);

    expect(card.classList.contains('selected')).toBe(false);
    expect(card.style.borderColor).toBe('rgb(37, 99, 235)');
    expect(card.style.boxShadow).toBe('0 2px 10px rgba(28, 25, 23, 0.08)');
  });

  it('removes selected edge styling from SVG clone', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'tree-edge--selected');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', '#eab308');
    group.appendChild(path);
    svg.appendChild(group);

    stripSvgSelectionChrome(svg);

    expect(group.classList.contains('tree-edge--selected')).toBe(false);
    expect(path.getAttribute('stroke')).toBeNull();
  });
});
