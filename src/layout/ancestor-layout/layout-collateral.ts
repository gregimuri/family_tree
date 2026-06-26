import type { LayoutContext } from './layout-context';
import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS, cardLeftEdge, cardRightEdge } from './grid-math';
import { placeCoupleAtCenter } from './layout-couple';
import { resolveLayerCollisionStep5 } from './subtree-shift';

/** Разместить оставшихся персон из графа (collateral). */
export function layoutRemainingPersons(ctx: LayoutContext): void {
  const layers = [...new Set([...ctx.personToNode.values()].map((n) => n.layer))].sort(
    (a, b) => a - b,
  );

  for (const layer of layers) {
    const unplaced = [...ctx.personToNode.keys()].filter(
      (id) => !ctx.isPlaced(id) && ctx.graphNode(id)?.layer === layer,
    );
    if (unplaced.length === 0) continue;

    unplaced.sort((a, b) => {
      const ba = ctx.graphNode(a)?.birthOrder ?? 0;
      const bb = ctx.graphNode(b)?.birthOrder ?? 0;
      return ba - bb || a.localeCompare(b);
    });

    for (const personId of unplaced) {
      const gn = ctx.graphNode(personId)!;
      let placed = false;

      for (const uid of ctx.project.persons[personId]?.unionIds ?? []) {
        const union = ctx.project.unions[uid];
        if (!union || union.partnerIds.length < 2) continue;
        const other = union.partnerIds.find((id) => id !== personId);
        if (other && ctx.isPlaced(other)) {
          placeCoupleAtCenter(ctx, union.partnerIds, ctx.getPlacement(other)!.centerXCells, layer);
          placed = true;
          break;
        }
      }

      if (placed) continue;

      const onLayer = ctx.personsOnLayer(layer);
      if (onLayer.length === 0) {
        ctx.placePerson(personId, 0, { layer });
      } else if (gn.branchSide === 'left') {
        const minLeft = Math.min(...onLayer.map((p) => cardLeftEdge(p.centerXCells)));
        ctx.placePerson(personId, minLeft - COUPLE_GAP_CELLS - CARD_WIDTH_CELLS / 2, { layer });
      } else {
        const maxRight = Math.max(...onLayer.map((p) => cardRightEdge(p.centerXCells)));
        ctx.placePerson(personId, maxRight + COUPLE_GAP_CELLS + CARD_WIDTH_CELLS / 2, { layer });
      }
    }

    resolveLayerCollisionStep5(ctx, layer);
  }
}
