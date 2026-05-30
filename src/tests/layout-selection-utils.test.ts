import { describe, it, expect } from 'vitest';
import { normalizeRect, rectsIntersect } from '../components/tree/layout-selection-utils';

describe('layout selection utils', () => {
  it('normalizes marquee rectangle', () => {
    expect(normalizeRect(10, 20, 30, 5)).toEqual({ x: 10, y: 5, width: 20, height: 15 });
  });

  it('detects card intersection with selection box', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectsIntersect(box, { x: 80, y: 80, width: 40, height: 40 })).toBe(true);
    expect(rectsIntersect(box, { x: 200, y: 200, width: 20, height: 20 })).toBe(false);
  });
});
