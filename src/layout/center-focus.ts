import type { LayoutResult, Project } from '../types';
import { getTreeSheetBounds } from './content-bounds';
import { TREE_SHEET_STROKE_PAD } from './tree-sheet';

export interface LayoutFocusPoint {
  x: number;
  y: number;
}

export interface TreeFrame {
  svgW: number;
  svgH: number;
  offsetX: number;
  offsetY: number;
  focusSvgX: number;
  focusSvgY: number;
}

function focusNodesForCenter(project: Project, layout: LayoutResult) {
  const { center } = project;

  if (center.type === 'family') {
    const partners = layout.nodes.filter((n) => n.unionId === center.id);
    if (partners.length > 0) return partners;
  }

  const personNode = layout.nodes.find((n) => n.personId === center.id);
  if (personNode) {
    if (personNode.unionId) {
      const couple = layout.nodes.filter(
        (n) => n.unionId === personNode.unionId && n.layer === personNode.layer,
      );
      if (couple.length > 0) return couple;
    }
    return [personNode];
  }

  const layerZero = layout.nodes.filter((n) => n.layer === 0);
  if (layerZero.length > 0) return layerZero;
  return layout.nodes.length ? [layout.nodes[0]] : [];
}

export function getCenterFocusPoint(project: Project, layout: LayoutResult): LayoutFocusPoint | null {
  const nodes = focusNodesForCenter(project, layout);
  if (nodes.length === 0) return null;

  const xs = nodes.map((n) => n.x);
  const xe = nodes.map((n) => n.x + n.width);
  const ys = nodes.map((n) => n.y);
  const ye = nodes.map((n) => n.y + n.height);

  return {
    x: (Math.min(...xs) + Math.max(...xe)) / 2,
    y: (Math.min(...ys) + Math.max(...ye)) / 2,
  };
}

/** Canvas tightly wraps content around the focus point (no mirrored empty margin). */
export function getSymmetricTreeFrame(
  project: Project,
  layout: LayoutResult,
  pad: number,
): TreeFrame | null {
  const focus = getCenterFocusPoint(project, layout);
  if (!focus) return null;

  const content = getTreeSheetBounds(layout);
  const leftSpan = Math.max(focus.x - content.minX, 0);
  const rightSpan = Math.max(content.maxX - focus.x, 0);
  const topSpan = Math.max(focus.y - content.minY, 0);
  const bottomSpan = Math.max(content.maxY - focus.y, 0);

  const innerW = Math.max(leftSpan + rightSpan, 1);
  const innerH = Math.max(topSpan + bottomSpan, 1);
  const inset = TREE_SHEET_STROKE_PAD;

  const svgW = innerW + pad * 2 + inset * 2;
  const svgH = innerH + pad * 2 + inset * 2;
  const focusSvgX = inset + pad + leftSpan;
  const focusSvgY = inset + pad + topSpan;

  return {
    svgW,
    svgH,
    offsetX: focusSvgX - focus.x,
    offsetY: focusSvgY - focus.y,
    focusSvgX,
    focusSvgY,
  };
}
