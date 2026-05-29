import type { LayoutEdge, LayoutResult } from '../types';
import { CARD_H_TEXT } from './card-dimensions';
import { LAYER_GAP } from './graph-builder';
import { computeBounds } from './layered-layout';

const EDGE_STROKE_PAD = 6;
const MARRIAGE_LABEL_PAD_Y = 14;
const MARRIAGE_LABEL_HALF_W = 48;

export function unionBounds(
  a: LayoutResult['bounds'],
  b: LayoutResult['bounds'],
): LayoutResult['bounds'] {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function getEdgeBounds(edges: LayoutEdge[]): LayoutResult['bounds'] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;

  for (const edge of edges) {
    for (const point of edge.points) {
      any = true;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    if (edge.id.startsWith('bond-') && edge.points.length >= 2) {
      const labelY = edge.points[0].y - 10;
      const labelX = (edge.points[0].x + edge.points[edge.points.length - 1].x) / 2;
      minY = Math.min(minY, labelY - MARRIAGE_LABEL_PAD_Y);
      minX = Math.min(minX, labelX - MARRIAGE_LABEL_HALF_W);
      maxX = Math.max(maxX, labelX + MARRIAGE_LABEL_HALF_W);
    }
  }

  if (!any) return null;

  return {
    minX: minX - EDGE_STROKE_PAD,
    minY: minY - EDGE_STROKE_PAD,
    maxX: maxX + EDGE_STROKE_PAD,
    maxY: maxY + EDGE_STROKE_PAD,
  };
}

function minHeightForLayers(layout: LayoutResult): number {
  if (layout.nodes.length === 0) return CARD_H_TEXT;
  const layers = layout.nodes.map((n) => n.layer);
  const spread = Math.max(...layers) - Math.min(...layers);
  return spread * LAYER_GAP + CARD_H_TEXT;
}

/** Границы всего содержимого листа: карточки и геометрия связей. */
export function getTreeSheetBounds(layout: LayoutResult): LayoutResult['bounds'] {
  let bounds = computeBounds(layout.nodes);
  const edgeBounds = getEdgeBounds(layout.edges);
  if (edgeBounds) bounds = unionBounds(bounds, edgeBounds);

  const minH = minHeightForLayers(layout);
  const height = bounds.maxY - bounds.minY;
  if (height + 0.5 < minH) {
    bounds = { ...bounds, maxY: bounds.minY + minH };
  }

  return bounds;
}
