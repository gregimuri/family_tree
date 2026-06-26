import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS, coupleSpanCells } from './grid-math';
import { sortPartnersMaleLeft } from './layout-context';
import type { LayoutContext } from './layout-context';
import { findCoupleOnLayer, personHalfWidthCells } from './subtree-shift';

/** Центр группы детей союза (для нескольких siblings). */
function unionChildrenCenterCells(ctx: LayoutContext, childIds: string[]): number {
  const xs = childIds
    .map((id) => ctx.getPlacement(id)?.centerXCells)
    .filter((x): x is number => x !== undefined);
  if (xs.length === 0) return 0;
  if (xs.length === 1) return xs[0];
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** Центр группы на слое с учётом пар (для выравнивания над несколькими парами). */
export function childGroupCenterCells(ctx: LayoutContext, childIds: string[], childLayer: number): number {
  const assigned = new Set<string>();
  let minLeft = Infinity;
  let maxRight = -Infinity;

  for (const cid of childIds) {
    for (const id of findCoupleOnLayer(ctx, cid, childLayer)) {
      if (assigned.has(id)) continue;
      assigned.add(id);
      const p = ctx.getPlacement(id)!;
      minLeft = Math.min(minLeft, p.centerXCells - personHalfWidthCells(ctx, id));
      maxRight = Math.max(maxRight, p.centerXCells + personHalfWidthCells(ctx, id));
    }
  }

  if (!Number.isFinite(minLeft)) return 0;
  return (minLeft + maxRight) / 2;
}

export function placeCoupleAtCenter(
  ctx: LayoutContext,
  partnerIds: string[],
  coupleCenterCells: number,
  layer: number,
): void {
  const sorted = sortPartnersMaleLeft(partnerIds, ctx.project);
  const w = CARD_WIDTH_CELLS;
  const span = coupleSpanCells();
  const leftCenter = coupleCenterCells - span / 2 + w / 2;
  const rightCenter = leftCenter + w + COUPLE_GAP_CELLS;
  if (sorted[0]) ctx.placePerson(sorted[0], leftCenter, { layer });
  if (sorted[1] && sorted[1] !== sorted[0]) {
    ctx.placePerson(sorted[1], rightCenter, { layer });
  }
}

export function placeParentCoupleOverChild(
  ctx: LayoutContext,
  _childId: string,
  parentUnionId: string,
): void {
  placeParentCoupleOverUnion(ctx, parentUnionId);
}

/** Шаги 3–4: пара родителей над центром группы детей союза. */
export function placeParentCoupleOverUnion(ctx: LayoutContext, parentUnionId: string): void {
  const union = ctx.project.unions[parentUnionId];
  if (!union) return;

  const visibleChildren = union.childIds.filter(
    (id) => ctx.personToNode.has(id) && ctx.isPlaced(id),
  );
  if (visibleChildren.length === 0) return;

  const childLayer = Math.max(...visibleChildren.map((id) => ctx.getPlacement(id)!.layer));
  const parentLayer = childLayer - 1;
  const partners = union.partnerIds.filter((id) => ctx.personToNode.has(id));
  if (partners.length === 0) return;

  const centerX = unionChildrenCenterCells(ctx, visibleChildren);
  if (partners.length >= 2) {
    placeCoupleAtCenter(ctx, partners, centerX, parentLayer);
  } else {
    ctx.placePerson(partners[0], centerX, { layer: parentLayer });
  }
}
