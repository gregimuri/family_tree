import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS, coupleSpanCells } from './grid-math';
import { sortPartnersMaleLeft } from './layout-context';
import type { LayoutContext } from './layout-context';

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
  childId: string,
  parentUnionId: string,
): void {
  const child = ctx.getPlacement(childId);
  if (!child) return;
  const partners = ctx.project.unions[parentUnionId]?.partnerIds.filter((id) =>
    ctx.personToNode.has(id),
  );
  if (!partners || partners.length === 0) return;
  const parentLayer = child.layer - 1;
  const centerX = child.centerXCells;
  if (partners.length >= 2) {
    placeCoupleAtCenter(ctx, partners, centerX, parentLayer);
  } else {
    ctx.placePerson(partners[0], centerX, { layer: parentLayer });
  }
}
