import type { LayoutContext } from './layout-context';
import { childCenterXCells } from './layout-context';
import { pickSecondaryParentId, sortPartnersMaleLeft } from './primary-parent-rule';
import {
  collectTowardCenterSubtree,
  recenterCoupleOverChild,
  resolveLayerOverlapAfterExpand,
} from './subtree-shift';
import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS } from './grid-math';

/** Фаза B: спуск сверху вниз — дорисовка второго родителя в partial union. */
export function layoutAncestorsComplete(ctx: LayoutContext): void {
  const partial = [...ctx.unionStates.values()].filter((u) => u.status === 'partial');
  const layers = [
    ...new Set(
      partial.flatMap((s) =>
        s.placedPartnerIds
          .map((id) => ctx.getPlacement(id)?.layer)
          .filter((l): l is number => l !== undefined),
      ),
    ),
  ].sort((a, b) => a - b);

  for (const layer of layers) {
    for (const state of partial) {
      if (state.status !== 'partial') continue;
      const union = ctx.project.unions[state.unionId];
      if (!union || union.partnerIds.length < 2) continue;

      const placedOnLayer = state.placedPartnerIds
        .map((id) => ctx.getPlacement(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p && p.layer === layer));
      if (placedOnLayer.length === 0) continue;

      const primaryId = state.placedPartnerIds[0];
      const childId = state.childPersonIds.find((id) => ctx.isPlaced(id));
      if (!childId) continue;

      const secondaryId = pickSecondaryParentId(
        childId,
        state.unionId,
        ctx.project,
        primaryId,
      );
      if (!secondaryId || ctx.isPlaced(secondaryId)) {
        ctx.markUnionComplete(state.unionId, state.childPersonIds, union.partnerIds);
        continue;
      }

      const childCenter = childCenterXCells(ctx, state.childPersonIds);
      const sorted = sortPartnersMaleLeft(union.partnerIds, ctx.project);
      const w = CARD_WIDTH_CELLS;
      const span = w * 2 + COUPLE_GAP_CELLS;
      const leftCenter = childCenter - span / 2 + w / 2;
      const rightCenter = leftCenter + w + COUPLE_GAP_CELLS;

      const maleFirst = sorted[0];
      const maleCenter = maleFirst === primaryId ? leftCenter : rightCenter;
      const femaleCenter = maleFirst === primaryId ? rightCenter : leftCenter;

      const primaryPlacement = ctx.getPlacement(primaryId)!;
      ctx.placePerson(primaryId, primaryId === sorted[0] ? maleCenter : femaleCenter, {
        layer: primaryPlacement.layer,
      });
      ctx.placePerson(secondaryId, secondaryId === sorted[0] ? maleCenter : femaleCenter, {
        layer: primaryPlacement.layer,
      });

      ctx.addPartnerToPartialUnion(state.unionId, secondaryId);
      ctx.markUnionComplete(state.unionId, state.childPersonIds, union.partnerIds);

      recenterCoupleOverChild(ctx, state.unionId, union.partnerIds, state.childPersonIds);

      const childSubtree = collectTowardCenterSubtree(ctx, primaryId);
      for (const pid of state.childPersonIds) {
        collectTowardCenterSubtree(ctx, pid).forEach((id) => childSubtree.add(id));
      }

      resolveLayerOverlapAfterExpand(ctx, layer, [primaryId, secondaryId]);
    }
  }
}
