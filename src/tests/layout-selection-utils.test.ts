import { describe, it, expect } from 'vitest';
import {
  normalizeRect,
  rectsIntersect,
  isMarqueePointerTarget,
  applyMarqueeSelection,
} from '../components/tree/layout-selection-utils';

describe('layout selection utils', () => {
  it('normalizes marquee rectangle', () => {
    expect(normalizeRect(10, 20, 30, 5)).toEqual({ x: 10, y: 5, width: 20, height: 15 });
  });

  it('detects card intersection with selection box', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectsIntersect(box, { x: 80, y: 80, width: 40, height: 40 })).toBe(true);
    expect(rectsIntersect(box, { x: 200, y: 200, width: 20, height: 20 })).toBe(false);
  });

  it('merges marquee selection when additive', () => {
    expect(applyMarqueeSelection(['a', 'b'], ['c', 'd'], true)).toEqual(new Set(['a', 'b', 'c', 'd']));
    expect(applyMarqueeSelection(['a', 'b'], ['b', 'c'], true)).toEqual(new Set(['a', 'b', 'c']));
    expect(applyMarqueeSelection(['a', 'b'], ['c'], false)).toEqual(new Set(['c']));
  });

  it('allows marquee on sheet background but not on cards or edge hits', () => {
    document.body.innerHTML = `
      <svg>
        <rect class="sheet-bg" />
        <g class="person-card"><foreignObject><div class="person-card-html"></div></foreignObject></g>
        <path class="tree-edge-hit" />
      </svg>
    `;
    const svg = document.body.querySelector('svg')!;
    expect(isMarqueePointerTarget(svg.querySelector('.sheet-bg')!)).toBe(true);
    expect(isMarqueePointerTarget(svg.querySelector('.person-card-html')!)).toBe(false);
    expect(isMarqueePointerTarget(svg.querySelector('.tree-edge-hit')!)).toBe(false);
  });
});
