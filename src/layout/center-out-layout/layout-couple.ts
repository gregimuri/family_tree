import type { Project } from '../../types';
import {
  CARD_WIDTH_CELLS,
  COUPLE_GAP_CELLS,
  cardLeftEdge,
  cardRightEdge,
  coupleSpanCells,
} from './grid-math';
import { sortPartnersMaleLeft } from './primary-parent-rule';
import type { LayoutContext } from './layout-context';

export interface CouplePlacement {
  partnerIds: string[];
  coupleCenterCells: number;
  leftCenterCells: number;
  rightCenterCells: number;
}

export function computeCoupleCenters(
  partnerIds: string[],
  coupleCenterCells: number,
  project: Project,
  scale = 1,
): CouplePlacement {
  const sorted = sortPartnersMaleLeft(partnerIds, project);
  const w = CARD_WIDTH_CELLS * scale;
  const span = coupleSpanCells(scale);
  const leftCenter = coupleCenterCells - span / 2 + w / 2;
  const rightCenter = leftCenter + w + COUPLE_GAP_CELLS;
  return {
    partnerIds: sorted,
    coupleCenterCells,
    leftCenterCells: leftCenter,
    rightCenterCells: rightCenter,
  };
}

export function placeCoupleAtCenter(
  ctx: LayoutContext,
  partnerIds: string[],
  coupleCenterCells: number,
  layer: number,
): CouplePlacement {
  const placement = computeCoupleCenters(partnerIds, coupleCenterCells, ctx.project);
  const [leftId, rightId] = placement.partnerIds;
  if (leftId) ctx.placePerson(leftId, placement.leftCenterCells, { layer });
  if (rightId && rightId !== leftId) {
    ctx.placePerson(rightId, placement.rightCenterCells, { layer });
  }
  return placement;
}

export function coupleBBoxCells(
  ctx: LayoutContext,
  partnerIds: string[],
  scale = 1,
): { min: number; max: number } | null {
  const placed = partnerIds
    .map((id) => ctx.getPlacement(id))
    .filter(Boolean);
  if (placed.length === 0) return null;
  const mins = placed.map((p) => cardLeftEdge(p!.centerXCells, scale));
  const maxs = placed.map((p) => cardRightEdge(p!.centerXCells, scale));
  return { min: Math.min(...mins), max: Math.max(...maxs) };
}

export function singleBBoxCells(centerCells: number, scale = 1): { min: number; max: number } {
  return {
    min: cardLeftEdge(centerCells, scale),
    max: cardRightEdge(centerCells, scale),
  };
}
