import type { LayoutResult, Project } from '../types';
import { getFramingBounds } from './framing-bounds';

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

/** Symmetric canvas so the tree center sits in the middle of the SVG, not in a corner. */
export function getSymmetricTreeFrame(
  project: Project,
  layout: LayoutResult,
  pad: number,
): TreeFrame | null {
  const focus = getCenterFocusPoint(project, layout);
  if (!focus) return null;

  const framing = getFramingBounds(project, layout);
  const leftSpan = focus.x - framing.minX;
  const rightSpan = framing.maxX - focus.x;
  const topSpan = focus.y - framing.minY;
  // Include orphan strip below the linked tree in canvas height.
  const bottomSpan = layout.bounds.maxY - focus.y;

  const halfW = Math.max(leftSpan, rightSpan, 1);
  const halfH = Math.max(topSpan, bottomSpan, 1);

  const svgW = halfW * 2 + pad * 2;
  const svgH = halfH * 2 + pad * 2;
  const focusSvgX = svgW / 2;
  const focusSvgY = svgH / 2;

  return {
    svgW,
    svgH,
    offsetX: focusSvgX - focus.x,
    offsetY: focusSvgY - focus.y,
    focusSvgX,
    focusSvgY,
  };
}
