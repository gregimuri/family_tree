import type { LayoutContext } from './layout-context';
import { childCenterXCells, sortPartnersMaleLeft } from './layout-context';
import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS } from './grid-math';
import { placeCoupleAtCenter } from './layout-couple';

const SIBLING_GAP_CELLS = COUPLE_GAP_CELLS;

/** Размещение потомков: дети под родителями, пары супругов рядом. */
export function buildDescendants(ctx: LayoutContext): void {
  const focusId = ctx.focusPersonId;
  const focus = ctx.getPlacement(focusId);
  if (!focus) return;

  const maxLayer = Math.max(...[...ctx.personToNode.values()].map((n) => n.layer), 0);

  for (let layer = 0; layer < maxLayer; layer++) {
    const parents = ctx.personsOnLayer(layer).filter((p) => !p.isSideBranch);
    for (const parent of parents) {
      for (const uid of ctx.project.persons[parent.personId]?.unionIds ?? []) {
        const union = ctx.project.unions[uid];
        if (!union) continue;
        const childIds = union.childIds.filter(
          (cid) => ctx.personToNode.has(cid) && ctx.graphNode(cid)!.layer === layer + 1,
        );
        if (childIds.length === 0) continue;

        const parentCenter = parent.centerXCells;
        const n = childIds.length;
        const totalSpan = n * CARD_WIDTH_CELLS + (n - 1) * SIBLING_GAP_CELLS;
        const startCenter = parentCenter - totalSpan / 2 + CARD_WIDTH_CELLS / 2;

        childIds.sort((a, b) => {
          const ba = ctx.graphNode(a)?.birthOrder ?? 0;
          const bb = ctx.graphNode(b)?.birthOrder ?? 0;
          return ba - bb || a.localeCompare(b);
        });

        for (let i = 0; i < childIds.length; i++) {
          const childId = childIds[i];
          const cx = startCenter + i * (CARD_WIDTH_CELLS + SIBLING_GAP_CELLS);
          if (ctx.isPlaced(childId)) continue;

          const spouses = (ctx.project.persons[childId]?.unionIds ?? [])
            .flatMap((u) => ctx.project.unions[u]?.partnerIds ?? [])
            .filter((id) => id !== childId && ctx.personToNode.has(id) && ctx.graphNode(id)!.layer === layer + 1);

          if (spouses.length > 0 && !spouses.some((id) => ctx.isPlaced(id))) {
            placeCoupleAtCenter(ctx, sortPartnersMaleLeft([childId, spouses[0]], ctx.project), cx, layer + 1);
          } else if (!ctx.isPlaced(childId)) {
            ctx.placePerson(childId, cx, { layer: layer + 1 });
          }
        }
      }
    }
  }

  for (const union of Object.values(ctx.project.unions)) {
    if (union.partnerIds.length < 2 || union.childIds.length === 0) continue;
    const visibleChildren = union.childIds.filter((id) => ctx.isPlaced(id));
    if (visibleChildren.length === 0) continue;
    const childCenter = childCenterXCells(ctx, visibleChildren);
    const parentLayer = Math.min(
      ...union.partnerIds.map((id) => ctx.getPlacement(id)?.layer ?? 999).filter((l) => l !== 999),
    );
    const visibleParents = union.partnerIds.filter((id) => ctx.isPlaced(id));
    if (visibleParents.length >= 2) {
      placeCoupleAtCenter(ctx, visibleParents, childCenter, parentLayer);
    }
  }
}
