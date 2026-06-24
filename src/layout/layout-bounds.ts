import type { LayoutNode, LayoutResult } from '../types';

export function computeBounds(nodes: LayoutNode[]): LayoutResult['bounds'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  if (!nodes.length) {
    minX = minY = 0;
    maxX = maxY = 400;
  }
  return { minX, minY, maxX, maxY };
}
