import type { LayoutResult, ManualLayoutEntry, Project } from '../types';
import type { LinkKind } from '../models/person-utils';
import { snapCardCenterToGridCorners } from './card-dimensions';
import { COUPLE_GAP, LAYER_GAP } from './graph-builder';

export function getPersonLayoutCenter(
  project: Project,
  layout: LayoutResult,
  personId: string,
): { x: number; y: number; width: number; height: number } | null {
  const node = layout.nodes.find((n) => n.personId === personId);
  if (!node?.personId) return null;
  const manual = project.manualLayout?.[personId];
  return {
    x: manual?.x ?? node.x + node.width / 2,
    y: manual?.y ?? node.y + node.height / 2,
    width: node.width,
    height: node.height,
  };
}

export function computePlacementNearAnchor(
  project: Project,
  layout: LayoutResult,
  newPersonId: string,
  anchorId: string,
  kind: LinkKind = 'partner',
): ManualLayoutEntry | null {
  const anchor = getPersonLayoutCenter(project, layout, anchorId);
  const newNode = layout.nodes.find((n) => n.personId === newPersonId);
  if (!anchor || !newNode) return null;

  const gridSize = newNode.width / 6;
  let cx = anchor.x;
  let cy = anchor.y;

  if (kind === 'partner') {
    cx = anchor.x + anchor.width / 2 + COUPLE_GAP + newNode.width / 2;
  } else if (kind === 'parent') {
    cy = anchor.y - LAYER_GAP * 0.72;
  } else if (kind === 'child') {
    cy = anchor.y + LAYER_GAP * 0.72;
  }

  return snapCardCenterToGridCorners(cx, cy, newNode.width, newNode.height, gridSize);
}
